import {
	Logger, logger,
	LoggingDebugSession,
	StoppedEvent, OutputEvent,
	Source, Module, ModuleEvent, InitializedEvent, Event, TerminatedEvent, LoadedSourceEvent, BreakpointEvent, InvalidatedEvent,
} from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as semver from 'semver';
import type * as vscode from 'vscode';
import { URI, Utils } from 'vscode-uri';
import { bufferChunks, encodeBreakpoints, luaBlockQuote, objectToLua } from '../Util/EncodingUtil';
import { FactorioProcess } from './FactorioProcess';
import type { ModInfo } from '../vscode/ModPackageProvider';
import { ModManager } from '../ModManager';
import { ModSettings } from '../ModSettings/ModSettings';
import { LuaFunction } from './LuaDisassembler';
import { BufferStream } from '../Util/BufferStream';
import type { ActiveFactorioVersion } from '../vscode/FactorioVersion';

interface ModPaths{
	uri: URI
	name: string
	version: string
	info: ModInfo
}
type EvaluateResponseBody = DebugProtocol.EvaluateResponse['body'] & {
	// translation ID for time this eval ran
	timer?: string
};

type resolver<T> = (value: T | PromiseLike<T>)=>void;

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	modsPath?: string // path of `mods` directory
	manageMod?: boolean
	useInstrumentMode?: boolean
	checkPrototypes?: boolean
	factorioArgs?: Array<string>
	env?: NodeJS.ProcessEnv
	adjustMods?:{[key:string]:boolean|string}
	adjustModSettings?:{
		scope: "startup"|"runtime-global"|"runtime-per-user"
		name: string
		value?:boolean|number|string
	}[]
	disableExtraMods?:boolean
	allowDisableBaseMod?:boolean
	hookSettings?:boolean
	hookData?:boolean
	hookControl?:string[]|boolean
	hookMode?:"debug"|"profile"|"profile2"

	hookLog?:boolean
	keepOldLog?:boolean

	runningBreak?:number
	runningTimeout?:number

	profileLines?:boolean
	profileFuncs?:boolean
	profileTree?:boolean
	profileSlowStart?: number
	profileUpdateRate?: number

	/** enable logging the Debug Adapter Protocol */
	trace?: boolean
}

class AllThreadsStoppedEvent extends StoppedEvent implements DebugProtocol.StoppedEvent {
	declare body: DebugProtocol.StoppedEvent["body"];
	constructor(reason: string, threadId?: number, exceptionText?: string) {
		super(reason, threadId, exceptionText);
		this.body.allThreadsStopped = true;
	}
}

export class FactorioModDebugSession extends LoggingDebugSession {
	private _configurationDone?: resolver<void>;
	private configDone: Promise<void>;

	private nextBreakpointID = 1;
	private readonly breakPoints = new Map<string, (DebugProtocol.SourceBreakpoint&{id:number; verified:boolean})[]>();
	private readonly breakPointsChanged = new Set<string>();

	// unhandled only by default
	private readonly exceptionFilters = new Set<string>(["unhandled"]);

	private readonly _modules = new Map<string, DebugProtocol.Module>();

	private readonly _responses = new Map<number, resolver<any>>();

	private readonly _dumps = new Map<number, resolver<string>>();
	private readonly translations = new Map<number, string>();
	private readonly buffers = new Map<number, Buffer>();
	private nextRef = 1;

	private factorio?: FactorioProcess;
	private stdinQueue:{mesg:string|Buffer;resolve:resolver<boolean>;consumed?:Promise<void>;signal?:AbortSignal}[] = [];

	private launchArgs?: LaunchRequestArguments;

	private inPrompt:number = 0;
	private pauseRequested:boolean = false;

	private readonly workspaceModInfo:ModPaths[] = [];

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor(
		private readonly activeVersion: Pick<ActiveFactorioVersion, "getBinaryVersion"|"configPathIsOverriden"|"defaultModsPath"|"configPath"|"dataPath"|"writeDataPath"|"factorioPath"|"nativeDebugger"|"docs">,
		private readonly fs: Pick<vscode.FileSystem, "readFile"|"writeFile"|"stat">,
		private readonly editorInterface: {
			readonly findWorkspaceFiles: (pattern:string)=>Thenable<vscode.Uri[]>
			readonly getExtension?: typeof vscode.extensions.getExtension
			readonly executeCommand?: typeof vscode.commands.executeCommand
		}
	) {
		super();

		this.objectInfoChunks = bufferChunks(objectToLua(this.activeVersion.docs.generate_debuginfo()), 3500);

		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
		this.setDebuggerPathFormat("uri");

		this.configDone = new Promise<void>((resolve)=>{
			this._configurationDone = resolve;
		});
	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		response.body.supportsConditionalBreakpoints = true;
		response.body.supportsHitConditionalBreakpoints = true;
		response.body.supportsEvaluateForHovers = true;
		response.body.exceptionBreakpointFilters = [
			{ filter: "pcall",  label: "Caught by pcall",  default: false },
			{ filter: "xpcall", label: "Caught by xpcall", default: false },
			{ filter: "unhandled", label: "Unhandled Exceptions", default: true },
		];
		response.body.supportsSetVariable = true;
		response.body.supportsModulesRequest = true;
		response.body.supportsLogPoints = true;
		response.body.supportsConfigurationDoneRequest = true;
		response.body.supportsLoadedSourcesRequest = true;
		response.body.supportsBreakpointLocationsRequest = true;

		response.body.supportsDisassembleRequest = true;
		response.body.supportsSteppingGranularity = true;
		response.body.supportsInstructionBreakpoints = false;

		this.sendResponse(response);
	}

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

		// notify that configuration has finished
		this._configurationDone?.();
	}



	protected async terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments) {
		this.sendResponse(response);
		return this.terminate();
	}

	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
		this.sendResponse(response);
		return this.terminate();
	}

	private async checkFactorioArgs(launchArgs: LaunchRequestArguments) {
		const args = launchArgs.factorioArgs;
		if (args) {
			if (args.includes("--config")) {
				this.sendEvent(new OutputEvent("Factorio --config option is set by configPath and should not be included in factorioArgs\n", "console"));
				return false;
			}
			if (args.includes("--mod-directory")) {
				this.sendEvent(new OutputEvent("Factorio --mod-directory option is set by modsPath and should not be included in factorioArgs\n", "console"));
				return false;
			}
		}
		return true;
	}

	private async resolveModsPath(args: LaunchRequestArguments) {
		let modsPathSource = undefined;

		if (args.modsPath) {
			modsPathSource = "launch";
			let modspath = path.posix.normalize(args.modsPath);
			if (modspath.match(/^~[\\\/]/)) {
				modspath = path.posix.join(
					os.homedir().replace(/\\/g, "/"),
					modspath.replace(/^~[\\\/]/, "") );
			}
			if (modspath.match(/[\\\/]$/)) {
				modspath = modspath.replace(/[\\\/]+$/, "");
			}
			try {
				await fsp.access(modspath);
				args.modsPath = modspath;
			} catch (error) {
				this.sendEvent(new OutputEvent("modsPath specified in launch configuration does not exist\n", "console"));
				return false;
			}
		} else {
			// modsPath not configured: detect from config.ini or mods-list.json in workspace
			const workspaceModLists = await this.editorInterface.findWorkspaceFiles("**/mod-list.json");

			if (workspaceModLists.length === 1) {
				// found one, just use it
				args.modsPath = path.dirname(workspaceModLists[0].fsPath);
				modsPathSource = "workspace";
			} else if (workspaceModLists.length > 1) {
				// found more than one
				this.sendEvent(new OutputEvent("multiple mod-list.json in workspace, please specify one as modsPath\n", "console"));
				return false;
			} else {
				// found none. detect from config.ini
				modsPathSource = "config";
				args.modsPath = await this.activeVersion.defaultModsPath();
			}
		}

		if (os.platform() === "win32" && args.modsPath.startsWith("/")) { args.modsPath = args.modsPath.substr(1); }

		args.modsPath = args.modsPath.replace(/\\/g, "/");
		this.sendEvent(new OutputEvent(`using modsPath ${args.modsPath} (${modsPathSource})\n`, "console"));

		if (modsPathSource !== "config") {
			let mods = args.modsPath;
			if (!mods.endsWith("/")) {
				mods += "/";
			}
			args.factorioArgs!.push("--mod-directory", mods);
		}
		return true;
	}

	private async setupMods(args: LaunchRequestArguments) {
		if (args.manageMod === false) {
			this.sendEvent(new OutputEvent(`automatic management of mods disabled\n`, "console"));
		} else {
			if (!args.adjustMods) { args.adjustMods = {}; }
			if (!args.allowDisableBaseMod) { args.adjustMods["base"] = true; }

			const manager = new ModManager(args.modsPath!);
			await manager.Loaded;
			if (args.disableExtraMods) {
				manager.disableAll();
			}
			for (const mod in args.adjustMods) {
				if (args.adjustMods.hasOwnProperty(mod)) {
					const adjust = args.adjustMods[mod];
					manager.set(mod, adjust);
				}
			}
			if (!args.noDebug) {
				manager.set("coverage", false);
				manager.set("profiler", false);
				const result = await manager.installMod("debugadapter", {origin: "bundle"});
				this.sendEvent(new OutputEvent(`package install debugadapter ${JSON.stringify(result)}\n`, "console"));
			} else {
				manager.set("debugadapter", false);
			}
			await manager.write();
			this.sendEvent(new OutputEvent(`debugadapter ${args.noDebug?"disabled":"enabled"} in mod-list.json\n`, "console"));
		}
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, path.join(os.tmpdir(), "fmtk.log"), true);

		this.launchArgs = args;

		args.hookSettings = args.hookSettings ?? false;
		args.hookData = args.hookData ?? false;
		args.hookControl = args.hookControl ?? true;
		args.hookMode = args.hookMode ?? "debug";
		args.trace = args.trace ?? false;
		args.factorioArgs = args.factorioArgs||[];

		if (args.env && Object.keys(args.env).length > 0) {
			this.sendEvent(new OutputEvent(`using custom environment variables: ${JSON.stringify(args.env)}\n`, "console"));
		}

		if (!await this.checkFactorioArgs(args)) {
			// terminate to actually stop the debug session
			// sending an error response to vscode doesn't seem to to anything, so dont' bother?
			this.sendEvent(new TerminatedEvent());
			this.sendErrorResponse(response, 1);
			if (!this._isRunningInline()) { process.exit(1); }
			return;
		}
		if (!await this.resolveModsPath(args)) {
			// terminate to actually stop the debug session
			// sending an error response to vscode doesn't seem to to anything, so dont' bother?
			this.sendEvent(new TerminatedEvent());
			this.sendErrorResponse(response, 1);
			if (!this._isRunningInline()) { process.exit(1); }
			return;
		}
		try {
			await this.setupMods(args);
		} catch (error) {
			this.sendEvent(new OutputEvent(`Error setting up mods: ${error}\n`, "console"));
			this.sendEvent(new TerminatedEvent());
			this.sendErrorResponse(response, 1);
			if (!this._isRunningInline()) { process.exit(1); }
			return;
		}

		const infos = await this.editorInterface.findWorkspaceFiles('**/info.json');
		await Promise.all(infos.map(this.updateInfoJson, this));

		this.sendEvent(new OutputEvent(`Checking Factorio Version...\n`, "console"));
		let fac_version:string;
		try {
			fac_version = await this.activeVersion.getBinaryVersion();
			this.sendEvent(new OutputEvent(`Factorio ${fac_version}\n`, "console"));
		} catch (error) {
			this.sendEvent(new OutputEvent(`Error reading Factorio Version: ${error}\n`, "console"));
			this.sendEvent(new TerminatedEvent());
			this.sendErrorResponse(response, 1);
			if (!this._isRunningInline()) { process.exit(1); }
			return;
		}

		if (!args.noDebug) {
			if (args.useInstrumentMode ?? true) {
				args.factorioArgs.push("--instrument-mod", "debugadapter");
			}
			if (semver.gte(fac_version, "1.1.107", {loose: true}) ) {
				args.factorioArgs.push("--enable-unsafe-lua-debug-api");
			}
			if ((args.checkPrototypes ?? true) && !args.factorioArgs.includes("--check-unused-prototype-data")) {
				args.factorioArgs.push("--check-unused-prototype-data");
			}
		}

		if (this.activeVersion.configPathIsOverriden()) {
			args.factorioArgs.push("--config", await this.activeVersion.configPath());
		}

		if (args.adjustModSettings) {
			const modSettingsUri = Utils.joinPath(URI.file(args.modsPath!), "mod-settings.dat");
			const settings = new ModSettings(new BufferStream(await this.fs.readFile(modSettingsUri)));
			for (const s of args.adjustModSettings) {
				if (s.value === undefined) {
					settings.set(s.scope, s.name);
				} else {
					switch (typeof s.value) {
						case 'string':
							settings.set(s.scope, s.name, { type: "string", value: s.value});
							break;
						case 'number':
							settings.set(s.scope, s.name, { type: "number", value: s.value});
							break;
						case 'boolean':
							settings.set(s.scope, s.name, { type: "bool", value: s.value});
							break;
					}

				}

			}
			await this.fs.writeFile(modSettingsUri, settings.save());
		}

		this.factorio = new FactorioProcess(this.activeVersion.factorioPath, args.factorioArgs, this.activeVersion.nativeDebugger, args.env);

		this.factorio.on("exit", (code:number|null, signal:string)=>{
			if (code) {
				// exit event in case somebody cares about the return code
				this.sendEvent(new Event("exited", {exitCode: code}));
			}
			// and terminate event to actually stop the debug session
			this.sendEvent(new TerminatedEvent());
		});

		let resolveModules:resolver<void>;
		const modulesReady = new Promise<void>((resolve)=>{
			resolveModules = resolve;
		});

		this.factorio.on("stderr", (mesg:Buffer)=>{
			const mstring = mesg.toString();
			if (mstring) {
				this.sendEvent(new OutputEvent(mstring+"\n", "stderr"));
			}
		});

		const daprevive = (key:string, value:any)=>{
			switch (typeof value) {
				case "string": {
					switch (value.charCodeAt(0)) {
						case 0xFDD0:
							return path.basename(value.slice(1));
						case 0xFDD1:
							return this.convertDebuggerPathToClient(value.slice(1));
						case 0xFDD2:
							return this.convertDebuggerLineToClient(Number.parseInt(value.slice(1)));
						case 0xFDD4: {
							const id = Number.parseInt(value.slice(1));
							return this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
						}
						case 0xFDD5: {
							const id = Number.parseInt(value.slice(1));
							return this.buffers.get(id) ?? `{Missing Buffer ID ${id}}`;
						}
					}
				}
			}
			return value;
		};

		const rawUnpack = (buff:Buffer)=>{
			const split = buff.indexOf(1, 3);

			const id = Number.parseInt(buff.subarray(3, split).toString().trim());
			let buffer = buff.subarray(split+1);
			let outbuffs = [];
			let i = buffer.indexOf(0xef);
			while (i>=0) {
				if (buffer[i+1] >= 0xA0 && buffer[i+1] <= 0xa3 &&
					buffer[i+2] >= 0x80 && buffer[i+2] <= 0xbf) {
					let esc = buffer.subarray(i, i+4).toString("utf8").charCodeAt(0) - 0xf800;
					outbuffs.push(buffer.subarray(0, i), Buffer.from([esc]));
					buffer = buffer.subarray(i+3);
				} else {
					outbuffs.push(buffer.subarray(0, i+1));
					buffer = buffer.subarray(i+1);
				}

				i = buffer.indexOf(0xef);
			}
			outbuffs.push(buffer);
			const outbuff = Buffer.concat(outbuffs);
			this.buffers.set(id, outbuff);
		};

		const dapmsg = async (buff:Buffer)=>{
			if (buff[2] === 0x97) {
				//0xFDD7 raw buffer
				rawUnpack(buff);
				return;
			}

			const mesg = buff.toString();
			switch (mesg.charCodeAt(0)) {
				case 0xFDD0: {
					this.inPrompt++;
					switch (mesg.charCodeAt(1)) {
						case 0xE000: // on_instrument_settings
							await modulesReady;
							this.clearQueuedStdin();
							if (this.launchArgs!.hookMode === "profile") {
								this.continueRequire(false, "#settings");
							} else {
								this.continueRequire(this.launchArgs!.hookSettings ?? false, "#settings");
							}
							return;
						case 0xE001: // on_instrument_data
							this.clearQueuedStdin();
							if (this.launchArgs!.hookMode === "profile") {
								this.continueRequire(false, "#data");
							} else {
								this.continueRequire(this.launchArgs!.hookData ?? false, "#data");
							}
							return;
						case 0xE002: { // on_instrument_control
							const modname = mesg.slice(2).trim();
							this.clearQueuedStdin();
							const hookmods = this.launchArgs!.hookControl ?? true;
							const shouldhook =
								// DA has to be specifically requested for hooks
								modname === "debugadapter" ? Array.isArray(hookmods) && hookmods.includes(modname) :
								// everything else...
								hookmods !== false && (hookmods === true || hookmods.includes(modname));
							if (this.launchArgs!.hookMode === "profile") {
								this.continueProfile(shouldhook);
							} else if (this.launchArgs!.hookMode === "profile2") {
								this.continueProfile(shouldhook, 2);
							} else {
								this.continueRequire(shouldhook, modname);
							}
							return;
						}
						case 0xE003: { // on_da_control
							const hookmods = this.launchArgs!.hookControl ?? true;
							const dahooked = ((Array.isArray(hookmods) && hookmods.includes("debugadapter")) || hookmods === false);
							if (this.launchArgs!.hookMode === "profile") {
								this.continueProfile(!dahooked);
							} else if (this.launchArgs!.hookMode === "profile2") {
								this.continueProfile(!dahooked, 2);
							} else {
								this.continueRequire(false, "debugadapter");
							}
							return;
						}
						case 0xE004: // object_info
							this.sendClassData();
							// continue without trying to write breakpoints,
							// we're not ready for them yet...
							this.writeStdin("cont");
							this.inPrompt--;
							return;
						case 0xE005: // getref
							this.allocateRefBlock();
							this.continue();
							return;
						//@ts-expect-error fallthrough
						case 0xE007: // on_data
							await this.configDone;
						case 0xE008: // on_parse
							this.clearQueuedStdin();
							this.allocateRefBlock();
							this.continue(true);
							return;
						case 0xE006: // on_tick
						case 0xE009: // on_init
						case 0xE00A: // on_load
							await this.runQueuedStdin();
							this.continue(true);
							return;
						case 0xE00C: // terminate
							await this.terminate();
							return;
						default:
							return;
					}
				}
				case 0xFDD1: {
					this.inPrompt++;
					const json = JSON.parse(mesg.slice(1), daprevive) as {event:string; body:any};
					switch (json.event) {
						case "source":
							const lse = this.loadedSourceEvent(json.body);
							const source = json.body.source;
							if (this.breakPoints.has(source.sourceReference ?? source.name)) {
								await lse;
							}
							this.continue();
							return;
						case "running":
							await this.runQueuedStdin();
							if (this.pauseRequested) {
								this.pauseRequested = false;
								if (this.breakPointsChanged.size !== 0) {
									this.updateBreakpoints();
								}
								this.sendEvent(new AllThreadsStoppedEvent('pause', json.body.threadId));
							} else {
								this.continue();
							}
							return;
						case "exception":
							await this.runQueuedStdin();
							if (json.body.filter === "manual" || this.exceptionFilters.has(json.body.filter)) {
								this.sendEvent(new AllThreadsStoppedEvent('exception', json.body.threadId, json.body.mesg));
							} else {
								this.continue();
							}
							return;
						case "stopped":
							await this.runQueuedStdin();
							if (this.breakPointsChanged.size !== 0) {
								this.updateBreakpoints();
							}
							this.sendEvent(new AllThreadsStoppedEvent(json.body.reason, json.body.threadId));
							return;
						default:
							return;
					}
				}
				case 0xFDD4: { // translation
					const split = mesg.indexOf("\x01");
					const id = Number.parseInt(mesg.slice(1, split).trim());
					const translation = mesg.slice(split+1);
					this.translations.set(id, translation);
					return;
				}
				case 0xFDD5: { // json events
					const json = JSON.parse(mesg.slice(1), daprevive) as {event:string; body:any};
					switch (json.event) {
						case "modules":
							await this.updateModules(json.body);
							resolveModules();
							// and finally send the initialize event to get breakpoints and such...
							this.sendEvent(new InitializedEvent());
							return;
						case "output":
						{
							const output = json as OutputEvent;
							if (!output.body.output.endsWith("\n")) {
								output.body.output += "\n";
							}
							this.sendEvent(output);
							return;
						}
						default:
							return;
					}
				}
				case 0xFDD6: { // json response
					const json = JSON.parse(mesg.slice(1), daprevive) as {seq:number; body:any};
					this._responses.get(json.seq)!(json.body);
					this._responses.delete(json.seq);
					return;
				}
				case 0xFDD8: { // invalidated event
					this.sendEvent(new InvalidatedEvent());
					return;
				}
			}
		};

		const profilemsg = (buff:Buffer)=>{
			const mesg = buff.toString("utf8");
			switch (mesg.charCodeAt(0)) {
				case 0xFDE0: // profile line
				case 0xFDE1: // profile call
				case 0xFDE2: // profile tailcall
				case 0xFDE3: // profile return
					return;
			}
		};

		this.factorio.on("stdout", async (mesg:Buffer)=>{
			if (mesg[0] === 0xEF && mesg[1] === 0xB7) {
				switch (mesg[2]) {
					case 0x90: //0xFDD0:
					case 0x91: //0xFDD1:
					case 0x94: //0xFDD4:
					case 0x95: //0xFDD5:
					case 0x96: //0xFDD6:
					case 0x97: //0xFDD7:
					case 0x98: //0xFDD8:
						await dapmsg(mesg);
						return;
					case 0xA0: //0xFDE0: // profile line
					case 0xA1: //0xFDE1: // profile call
					case 0xA2: //0xFDE2: // profile tailcall
					case 0xA3: //0xFDE3: // profile return
						profilemsg(mesg);
						return;
					case 0xAD: //0xFDED: // v1 profile
						this.sendEvent(new Event("x-Factorio-Profile", mesg.toString().slice(1)));
						return;
				}
			}
			const mstring = mesg.toString();
			if (mstring) {
				this.sendEvent(new OutputEvent(mesg.toString()+"\n", "stdout"));
			}
			return;
		});

		this.sendResponse(response);
	}

	private allocateRefBlock() {
		const nextRef = this.nextRef;
		this.nextRef += 4096;
		this.writeStdin(`__DebugAdapter.__dap.transferRef(${nextRef})`);
	}

	protected convertClientPathToDebugger(clientPath: string): string {
		// URI and super disagree about what shoudl be percent-encoded, make sure it's all consistent...
		clientPath = URI.parse(super.convertClientPathToDebugger(clientPath)).toString();
		if (clientPath.startsWith("output:")) { return clientPath; }

		let thismodule:DebugProtocol.Module|undefined;
		this._modules.forEach(m=>{
			if (m.symbolFilePath && clientPath.startsWith(m.symbolFilePath) &&
				m.symbolFilePath.length > (thismodule?.symbolFilePath||"").length) {
				thismodule = m;
			}
		});

		if (thismodule?.name === "#user" && clientPath.startsWith(thismodule.symbolFilePath+"/mods")) {
			thismodule = undefined;
		}

		if (thismodule) {
			return clientPath.replace(thismodule.symbolFilePath!, "@__"+thismodule.name+"__");
		}

		return clientPath;
	}

	protected convertDebuggerPathToClient(debuggerPath: string): string {
		const matches = debuggerPath.match(/^@__(.*?)__\/(.*)$/);
		if (matches) {
			const thismodule = this._modules.get(matches[1]);
			if (thismodule?.symbolFilePath) {
				return super.convertDebuggerPathToClient(
					Utils.joinPath(URI.parse(thismodule.symbolFilePath), matches[2]).toString()
				);
			}
		}

		// it won't be uri-shaped, so just return it as-is here...
		// (this happens if zipped mods are present and zip-handling has not loaded them)
		return debuggerPath;
	}

	protected async customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined) {
		switch (command) {
			case "x-Factorio-ConvertPath":
				response.body = this.convertDebuggerPathToClient(args.path);
				break;
			case 'modules':
				return this.modulesRequest(response as DebugProtocol.ModulesResponse, args as DebugProtocol.ModulesArguments);
			default:
				response.success=false;
				response.message="Unknown request";
				break;
		}

		this.sendResponse(response);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		let bppath:string;
		if (args.source.path) {
			const inpath = args.source.path;
			bppath = this.convertClientPathToDebugger(inpath);
		} else {
			bppath = `&ref ${args.source.sourceReference}`;
		}

		const lines = this.lines_by_source.get(args.source.sourceReference ?? bppath );
		const oldbps = this.breakPoints.get(bppath) ?? [];

		const bps = (args.breakpoints ?? []).map((bp)=>{
			bp.line = this.convertClientLineToDebugger(bp.line);
			const oldbp = oldbps.find(old=>bp.line===old.line && bp.column===old.column);
			if (oldbp) {
				oldbp.condition = bp.condition;
				oldbp.hitCondition = bp.hitCondition;
				oldbp.logMessage = bp.logMessage;
				return oldbp;
			}
			let verified = false;
			if (lines) {
				let lastline = 0;
				for (const line of lines) {
					if (line >= bp.line) {
						bp.line = line;
						verified = true;
						break;
					}
					if (line > lastline) {
						lastline = line;
					}
				}
				if (!verified && lastline > 0) {
					// if it's after the last line, it'll fall through to here...
					bp.line = lastline;
					verified = true;
				}
			}
			return Object.assign(bp, {id: this.nextBreakpointID++, verified: verified});
		});

		this.breakPoints.set(bppath, bps);
		this.breakPointsChanged.add(bppath);

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: bps,
		};
		this.sendResponse(response);
	}

	private revalidateBreakpoints(source:string|number) {
		const bppath = typeof source === "number" ? `&ref ${source}` : source;
		const bps = this.breakPoints.get(bppath);
		if (!bps) { return; }

		this.breakPointsChanged.add(bppath);
		const lines = this.lines_by_source.get(source)!;
		for (const bp of bps) {
			let lastline = 0;
			for (const line of lines) {
				if (line >= bp.line) {
					bp.line = line;
					bp.verified = true;
					this.sendEvent(new BreakpointEvent("changed", bp));
					break;
				}
				if (line > lastline) {
					lastline = line;
				}
			}
			if (!bp.verified && lastline > 0) {
				// if it's after the last line, it'll fall through to here...
				bp.line = lastline;
				bp.verified = true;
				this.sendEvent(new BreakpointEvent("changed", bp));
			}
		}
	}

	protected async threadsRequest(response: DebugProtocol.ThreadsResponse) {

		if (this.inPrompt > 0) {
			response.body = await new Promise<{threads:DebugProtocol.Thread[]}>((resolve)=>{
				this._responses.set(response.request_seq, resolve);
				this.writeStdin(`__DebugAdapter.__dap.threads(${response.request_seq})\n`);
			});
			this.sendResponse(response);
		} else {
			// sometimes vscode tries to ask too early?
			this.sendErrorResponse(response, {format: "threads not ready now", id: 817});
		}
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;

		const stack = await new Promise<DebugProtocol.StackFrame[]>((resolve)=>{
			this._responses.set(response.request_seq, resolve);
			this.writeStdin(`__DebugAdapter.__dap.stackTrace(${args.threadId},${startFrame},${response.request_seq})\n`);
		});

		response.body = { stackFrames: (stack as (DebugProtocol.StackFrame&{linedefined:number; currentpc:number})[]).map(
			(frame)=>{
				if (frame && frame.source) {
					if (frame.source.path) {
						frame.source.path = this.convertDebuggerPathToClient(frame.source.path);
					}
					const sourceid = frame.source.sourceReference ?? frame.source.name;
					if (sourceid) {
						const dump = this.dumps_by_source.get(sourceid)?.get(frame.linedefined);
						if (dump) {
							if (dump.baseAddr) {
								frame.instructionPointerReference = "0x"+(dump.baseAddr + frame.currentpc).toString(16);
							}
						}
					}
				}
				return frame;
			}
		) };
		this.sendResponse(response);

	}

	protected async modulesRequest(response: DebugProtocol.ModulesResponse, args: DebugProtocol.ModulesArguments) {
		const modules = Array.from(this._modules.values());
		response.body = { modules: modules };
		this.sendResponse(response);
	}

	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		const scopes = new Promise<DebugProtocol.Scope[]>((resolve)=>{
			this._responses.set(response.request_seq, resolve);
			this.writeStdin(`__DebugAdapter.__dap.scopes(${args.frameId}, ${response.request_seq})\n`);
		});
		response.body = { scopes: await scopes };
		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {
		let consume:resolver<void>;
		const consumed = new Promise<void>((resolve)=>consume=resolve);
		const ac = new AbortController();
		const vars = await Promise.race([
			new Promise<DebugProtocol.Variable[]>(async (resolve)=>{
				this._responses.set(response.request_seq, resolve);
				if (!await this.writeOrQueueStdin(
					`__DebugAdapter.__dap.variables(${args.variablesReference},${response.request_seq},${args.filter? `"${args.filter}"`:"nil"},${args.start || "nil"},${args.count || "nil"})\n`,
					consumed,
					ac.signal)) {
					this._responses.delete(response.request_seq);
					consume!();
					resolve([
						{
							name: "",
							value: `Expired variablesReference ref=${args.variablesReference} seq=${response.request_seq}`,
							type: "error",
							variablesReference: 0,
						},
					]);
				}
			}),
			new Promise<DebugProtocol.Variable[]>((resolve)=>{
				// just time out if we're in a menu with no lua running to empty the queue...
				// in which case it's just expired anyway
				setTimeout(()=>{
					ac.abort();
					resolve(<DebugProtocol.Variable[]>[
						{
							name: "",
							value: `No Lua State Available ref=${args.variablesReference} seq=${response.request_seq}`,
							type: "error",
							variablesReference: 0,
						},
					]);
				}, this.launchArgs!.runningTimeout ?? 2000);
			}),
		]);
		consume!();
		response.body = { variables: vars };
		if (vars.length === 1 && vars[0].type === "error") {
			response.success = false;
			response.message = vars[0].value;
		}
		this.sendResponse(response);
	}

	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments, request?: DebugProtocol.Request) {
		const body = await new Promise<DebugProtocol.Variable>((resolve)=>{
			this._responses.set(response.request_seq, resolve);
			this.writeStdin(`__DebugAdapter.__dap.setVariable(${args.variablesReference},${luaBlockQuote(Buffer.from(args.name))},${luaBlockQuote(Buffer.from(args.value))},${response.request_seq})\n`);
		});
		if (body.type === "error") {
			response.success = false;
			response.message = body.value;
		} else {
			response.body = body;
		}
		this.sendResponse(response);
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request) {
		let consume:resolver<void>;
		const consumed = new Promise<void>((resolve)=>consume=resolve);
		const ac = new AbortController();
		//TODO: proper matching against active mod names?
		const matches = args.expression.match(/^__(.+?)__ (.*)$/);
		let modname: string | undefined;
		if (matches) {
			modname = matches[1];
			args.expression = matches[2];
		}

		const target = modname ? luaBlockQuote(Buffer.from(modname)) :
			args.frameId ? args.frameId :
			"nil";
		const expr = luaBlockQuote(Buffer.from(args.expression.replace(/\n/g, " ")));
		const body = await Promise.race([
			new Promise<EvaluateResponseBody>(async (resolve)=>{
				this._responses.set(response.request_seq, resolve);
				if (!await this.writeOrQueueStdin(
					`__DebugAdapter.__dap.evaluate(${target},"${args.context}",${expr},${response.request_seq})\n`,
					consumed,
					ac.signal)) {
					this._responses.delete(response.request_seq);
					consume!();
					resolve({
						result: `Expired evaluate seq=${response.request_seq}`,
						type: "error",
						variablesReference: 0,
					});
				}
			}),
			new Promise<EvaluateResponseBody>((resolve)=>{
				// just time out if we're in a menu with no lua running to empty the queue...
				// in which case it's just expired anyway
				setTimeout(()=>{
					ac.abort();
					resolve({
						result: `No Lua State Available seq=${response.request_seq}`,
						type: "error",
						variablesReference: 0,
					});
				}, this.launchArgs!.runningTimeout ?? 2000);
			}),
		]);
		consume!();
		if (body.type === "error") {
			response.success = false;
			response.message = body.result;
		}
		response.body = body;
		if (body.timer) {
			const time = body.timer.replace(/^.*: /, "");
			body.result += "\n⏱️ " + time;
		}
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this.writeStdin(`__DebugAdapter.__dap.step_enabled(false)`);
		this.continue();
		this.sendResponse(response);
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments, request?: DebugProtocol.Request): void {
		this.pauseRequested = true;
		this.sendResponse(response);
	}

	private step(event:'in'|'out'|'over' = 'in', granularity:DebugProtocol.SteppingGranularity = "statement") {
		const stepdepth = {
			in: -1,
			over: 0,
			out: 1,
		};
		if (this.breakPointsChanged.size !== 0) {
			this.updateBreakpoints();
		}
		this.writeStdin(`__DebugAdapter.__dap.step_enabled(true)`);
		this.writeStdin(`__DebugAdapter.__dap.step(${stepdepth[event]},${granularity==="instruction"})`);
		this.writeStdin("cont");
		this.inPrompt--;
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this.step("over", args.granularity);
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this.step("in", args.granularity);
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		this.step("out", args.granularity);
		this.sendResponse(response);
	}

	protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this.exceptionFilters.clear();
		args.filters.forEach(f=>this.exceptionFilters.add(f));
		this.sendResponse(response);
	}

	private nextdump = 1;


	// dumps by souce,line
	private dumps_by_source = new Map<number|string, Map<number, LuaFunction>>();
	// dumps sorted by base address
	private dumps_by_address:LuaFunction[] = [];

	private lines_by_source = new Map<number|string, number[]>();

	private loadedSources:(Source&DebugProtocol.Source)[] = [];

	protected async loadedSourceEvent(loaded:{ source:Source&DebugProtocol.Source; dump?:Buffer }) {
		const source = loaded.source;

		if (loaded.dump) {
			const dumpid = source.sourceReference ?? source.name;
			let dump:LuaFunction;
			dump = new LuaFunction(loaded.dump);

			this.nextdump = dump.rebase(this.nextdump);

			const lines = new Set<number>();

			const by_line = new Map<number, LuaFunction>();

			dump.walk_functions(lf=>{
				if (lf.baseAddr) {
					const idx = this.dumps_by_address.findIndex(
						other=>lf.baseAddr!<other.baseAddr!);

					if (idx === -1) {
						this.dumps_by_address.push(lf);
					} else {
						this.dumps_by_address.splice(idx, 0, lf);
					}
				}


				by_line.set(lf.firstline, lf);

				lf.lines.forEach(l=>lines.add(l));
			});

			this.dumps_by_source.set(dumpid, by_line);
			this.lines_by_source.set(dumpid, Array.from(lines).sort((a, b)=>a-b));
			this.revalidateBreakpoints(dumpid);
		}
		this.loadedSources.push(source);
		this.sendEvent(new LoadedSourceEvent("new", source));
	}

	protected async disassembleRequest(response: DebugProtocol.DisassembleResponse, args: DebugProtocol.DisassembleArguments, request: DebugProtocol.DisassembleRequest) {
		const ref = parseInt(args.memoryReference);

		const instrs:DebugProtocol.DisassembledInstruction[] = [];
		response.body = { instructions: instrs };
		let start = ref + (args.instructionOffset??0);
		let len = args.instructionCount;

		//fill in invalid instruction at <= 0
		while (start < 1) {
			instrs.push({
				address: "0x"+start.toString(16),
				instruction: "<no instruction>",
			});
			start++;
			len--;
		}

		let idx = this.dumps_by_address.findIndex(
			lf=>lf.baseAddr &&
				lf.baseAddr<start &&
				lf.baseAddr + lf.instruction_count >= start
		);
		do {
			const f = this.dumps_by_address[idx];
			const ins = f.getInstructionsAtBase(start, len);
			if (ins) {
				instrs.push(...ins);
				len -= ins.length;
				start += ins.length;
			}
			idx++;
		} while (len > 0 && start < this.nextdump && idx < this.dumps_by_address.length);

		//fill in invalid instruction at >= last loaded
		while (len > 0) {
			instrs.push({
				address: "0x"+start.toString(16),
				instruction: "<no instruction>",
			});
			len--;
		}
		// and push next ahead in case more functions get loaded later...
		this.nextdump += len;

		this.sendResponse(response);
	}

	protected async breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request: DebugProtocol.BreakpointLocationsRequest) {
		let sourceid = args.source.sourceReference ?? args.source.path;
		if (sourceid) {
			if (typeof sourceid === "string") {
				sourceid = this.convertClientPathToDebugger(sourceid);
			}
			const lines = this.lines_by_source?.get(sourceid);
			if (lines) {
				response.body = {
					breakpoints: lines.map(l=>{ return {line: l}; }).filter(l=>l.line>=args.line && l.line <= (args.endLine ?? args.line)),
				};
			}
		}
		this.sendResponse(response);
	}

	protected async loadedSourcesRequest(response: DebugProtocol.LoadedSourcesResponse, args: DebugProtocol.LoadedSourcesArguments, request: DebugProtocol.LoadedSourcesRequest) {
		response.body = {sources: this.loadedSources};
		this.sendResponse(response);
	}

	protected async sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments): Promise<void> {
		const ref = args.source?.sourceReference;
		if (ref) {

			let consume:resolver<void>;
			const consumed = new Promise<void>((resolve)=>consume=resolve);
			const ac = new AbortController();
			const body = await Promise.race([
				new Promise<string|undefined>(async (resolve)=>{
					this._responses.set(response.request_seq, resolve);
					if (!await this.writeOrQueueStdin(
						`__DebugAdapter.__dap.source(${ref},${response.request_seq})\n`,
						consumed,
						ac.signal)) {
						this._dumps.delete(ref);
						consume!();
						resolve(`Expired source ref=${ref}`);
					}
				}),
				new Promise<string>((resolve)=>{
					// just time out if we're in a menu with no lua running to empty the queue...
					// in which case it's just expired anyway
					setTimeout(()=>{
						ac.abort();
						resolve(`No Lua State Available ref=${ref} seq=${response.request_seq}`);
					}, this.launchArgs!.runningTimeout ?? 2000);
				}),
			]);
			consume!();
			response.body = { content: body ?? "Invalid Source ID"};
		}
		this.sendResponse(response);
	}

	private async updateInfoJson(uri:URI) {
		try {
			let jsonpath = uri.path;
			if (os.platform() === "win32" && jsonpath.startsWith("/")) { jsonpath = jsonpath.substr(1); }
			const jsonstr = Buffer.from(await this.fs.readFile(uri)).toString('utf8');
			if (jsonstr) {
				const moddata = JSON.parse(jsonstr);
				if (moddata) {
					const mp = {
						uri: Utils.dirname(uri),
						name: moddata.name,
						version: moddata.version,
						info: moddata,
					};
					this.workspaceModInfo.push(mp);
				}
			}
		} catch (error) {
			this.sendEvent(new OutputEvent(`failed to read ${uri} ${error}\n`, "stderr"));
		}
	}

	private readonly objectInfoChunks: Buffer[];
	private sendClassData() {
		for (const chunk of this.objectInfoChunks) {
			this.writeStdin(Buffer.concat([
				Buffer.from("__DebugAdapter.loadObjectInfo("),
				luaBlockQuote(chunk),
				Buffer.from(")"),
			]));
		}
		this.writeStdin("__DebugAdapter.loadObjectInfo()");
	}

	private writeStdin(s:string|Buffer):void {
		if (this.inPrompt <= 0) {
			this.sendEvent(new OutputEvent(`!! Attempted to writeStdin "${s instanceof Buffer ? `Buffer[${s.length}]` : s}" while not in a prompt\n`, "console"));
			return;
		}

		this.factorio?.writeStdin(Buffer.concat([s instanceof Buffer ? s : Buffer.from(s), Buffer.from("\n")]));
	}

	private async writeOrQueueStdin(s:string|Buffer, consumed?:Promise<void>, signal?:AbortSignal):Promise<boolean> {
		if (this.inPrompt > 0) {
			this.writeStdin(s);
			if (consumed) { await consumed; }
			return true;
		} else {
			const p = new Promise<boolean>((resolve)=>this.stdinQueue.push({mesg: s, resolve: resolve, consumed: consumed, signal: signal}));
			return p;
		}
	}

	private async runQueuedStdin() {
		if (this.stdinQueue.length > 0) {
			for await (const b of this.stdinQueue) {
				if (b.signal?.aborted) {
					b.resolve(false);
				} else {
					this.writeStdin(b.mesg);
					b.resolve(true);
					if (b.consumed) {
						await b.consumed;
					}
				}
			}
			this.stdinQueue = [];
		}
	}

	private clearQueuedStdin():void {
		if (this.stdinQueue.length > 0) {
			this.stdinQueue.forEach(b=>{
				b.resolve(false);
			});
			this.stdinQueue = [];
		}
	}


	public continue(updateAllBreakpoints?:boolean) {
		if (this.inPrompt <= 0) {
			this.sendEvent(new OutputEvent(`!! Attempted to continue while not in a prompt\n`, "console"));
			return;
		}

		if (updateAllBreakpoints || this.breakPointsChanged.size !== 0) {
			this.updateBreakpoints(updateAllBreakpoints);
		}

		this.writeStdin("cont");
		this.inPrompt--;
	}

	public continueRequire(shouldRequire:boolean, modname:string) {
		if (this.inPrompt <= 0) {
			this.sendEvent(new OutputEvent(`!! Attempted to continueRequire while not in a prompt\n`, "console"));
			return;
		}
		if (shouldRequire) {
			let hookopts = "";
			if (this.launchArgs!.hookLog !== undefined) {
				hookopts += `hooklog=${this.launchArgs!.hookLog},`;
			}
			if (this.launchArgs!.keepOldLog !== undefined) {
				hookopts += `keepoldlog=${this.launchArgs!.keepOldLog},`;
			}
			if (this.launchArgs!.runningBreak !== undefined) {
				hookopts += `runningBreak=${this.launchArgs!.runningBreak},`;
			}

			this.writeStdin(`__DebugAdapter={__config={${hookopts}}}`);
		}

		this.writeStdin("cont");
		this.inPrompt--;
	}

	public continueProfile(shouldRequire:boolean, version?:number) {
		if (this.inPrompt <= 0) {
			this.sendEvent(new OutputEvent(`!! Attempted to continueProfile while not in a prompt\n`, "console"));
			return;
		}
		if (shouldRequire) {
			let hookopts = "";
			if (this.launchArgs!.profileSlowStart !== undefined) {
				hookopts += `slowStart=${this.launchArgs!.profileSlowStart},`;
			}
			if (this.launchArgs!.profileUpdateRate !== undefined) {
				hookopts += `updateRate=${this.launchArgs!.profileUpdateRate},`;
			}
			if (this.launchArgs!.profileLines !== undefined) {
				hookopts += `trackLines=${this.launchArgs!.profileLines},`;
			}
			if (this.launchArgs!.profileFuncs !== undefined) {
				hookopts += `trackFuncs=${this.launchArgs!.profileFuncs},`;
			}
			if (this.launchArgs!.profileTree !== undefined) {
				hookopts += `trackTree=${this.launchArgs!.profileTree},`;
			}

			this.writeStdin(`__Profiler${version||""}={${hookopts}}`);
		}

		this.writeStdin("cont");
		this.inPrompt--;
	}

	private async trydir(dir:URI, module:DebugProtocol.Module): Promise<boolean> {
		try {
			const stat = await this.fs.stat(dir);
			// eslint-disable-next-line no-bitwise
			if (stat.type&2/*vscode.FileType.Directory*/) {

				const modinfo:ModInfo = JSON.parse(Buffer.from(
					await this.fs.readFile(Utils.joinPath(dir, "info.json"))).toString("utf8"));
				if (modinfo.name===module.name && semver.eq(modinfo.version, module.version!, {"loose": true})) {
					module.symbolFilePath = dir.toString();
					module.symbolStatus = "Loaded Mod Directory";
					this.sendEvent(new OutputEvent(`loaded ${module.name} ${module.version} from modspath ${module.symbolFilePath}\n`, "console"));
					return true;
				}
			}
		} catch (ex) {
			if ((<vscode.FileSystemError>ex).code !== "FileNotFound" && (<vscode.FileSystemError>ex).code !== "ENOENT") {
				this.sendEvent(new OutputEvent(`failed loading ${module.name} ${module.version} from modspath: ${ex}\n`, "console"));
			}
			return false;
		}
		return false;
	}

	private async updateModules(modules: DebugProtocol.Module[]) {
		const zipext = this.editorInterface.getExtension?.("slevesque.vscode-zipexplorer");
		if (zipext) {
			await zipext.activate();
			await this.editorInterface.executeCommand!("zipexplorer.clear");
		}
		for (const module of modules) {
			try {
				this._modules.set(module.name, module);

				if (module.name === "#user") {
					module.symbolFilePath = URI.file(await this.activeVersion.writeDataPath()).toString();
					module.symbolStatus = "Loaded Write Data Directory";
					this.sendEvent(new OutputEvent(`loaded ${module.name} from config ${module.symbolFilePath}\n`, "console"));
					continue;
				}

				if (module.name === "level") {
					// find `level` nowhere
					module.symbolStatus = "No Symbols (Level)";
					continue;
				}

				try {
					const datadir = Utils.joinPath(URI.file(await this.activeVersion.dataPath()), module.name);
					const modinfo:ModInfo = JSON.parse(Buffer.from(
						await this.fs.readFile(Utils.joinPath(datadir, "info.json"))).toString("utf8"));
					if (modinfo.name===module.name) {
						module.symbolFilePath = datadir.toString();
						module.symbolStatus = "Loaded Data Directory";
						this.sendEvent(new OutputEvent(`loaded ${module.name} from data ${module.symbolFilePath}\n`, "console"));
						continue;
					}
				} catch {}

				const wm = this.workspaceModInfo.find(m=>m.name===module.name && semver.eq(m.version, module.version!, {"loose": true}));
				if (wm) {
					// find it in workspace
					module.symbolFilePath = wm.uri.toString();
					module.symbolStatus = "Loaded Workspace Directory";
					this.sendEvent(new OutputEvent(`loaded ${module.name} ${module.version} from workspace ${module.symbolFilePath}\n`, "console"));
					continue;
				}

				if (this.launchArgs!.modsPath) {
					// find it in mods dir:
					// 1) unversioned folder
					let dir = Utils.joinPath(URI.file(this.launchArgs!.modsPath), module.name);
					if (await this.trydir(dir, module)) { continue; };

					// 2) versioned folder
					dir = Utils.joinPath(URI.file(this.launchArgs!.modsPath), module.name+"_"+module.version);
					if (await this.trydir(dir, module)) { continue; };

					// 3) versioned zip
					if (zipext) {
						const zipuri = Utils.joinPath(URI.file(this.launchArgs!.modsPath), module.name+"_"+module.version+".zip");
						let stat:vscode.FileStat|undefined;
						try {
							stat = await this.fs.stat(zipuri);
						} catch (ex) {
							if ((<vscode.FileSystemError>ex).code !== "FileNotFound") {
								this.sendEvent(new OutputEvent(`${ex}\n`, "stderr"));
							}
						}
						// eslint-disable-next-line no-bitwise
						if (stat && (stat.type&1/*vscode.FileType.File*/)) {
							try {
								// if zip exists, try to mount it
								//TODO: can i check if it's already mounted somehow?
								//TODO: can i actually read dirname inside? doesn't seem to be registered as an fs handler
								await this.editorInterface.executeCommand!("zipexplorer.exploreZipFile", zipuri);

								const zipinside = Utils.joinPath(zipuri, module.name+"_"+module.version).with({scheme: "zip"});
								module.symbolFilePath = zipinside.toString();
								module.symbolStatus = "Loaded Zip";
								this.sendEvent(new OutputEvent(`loaded ${module.name} ${module.version} from mod zip ${zipuri.toString()}\n`, "console"));
								continue;
							} catch (ex) {
								this.sendEvent(new OutputEvent(`failed loading ${module.name} ${module.version} from mod zip ${zipuri.toString()}: ${ex}\n`, "console"));
							}
						}
					}
				}

				module.symbolStatus = "Unknown";
				this.sendEvent(new OutputEvent(`no source found for ${module.name} ${module.version}\n`, "console"));
			} catch (ex) {
				module.symbolStatus = "Error";
				this.sendEvent(new OutputEvent(`failed locating source for ${module.name} ${module.version}: ${ex}\n`, "console"));
			}
		}
		//TODO: another event to update it with levelpath for __level__ eventually?
		this._modules.forEach((module:Module)=>{
			this.sendEvent(new ModuleEvent('new', module));
		});
	}

	updateBreakpoints(updateAll:boolean = false) {
		const changes = Array<Buffer>();

		this.breakPoints.forEach((breakpoints:DebugProtocol.SourceBreakpoint[], filename:string)=>{
			if (updateAll || this.breakPointsChanged.has(filename)) {
				changes.push(Buffer.concat([
					Buffer.from("__DebugAdapter.__dap.updateBreakpoints("),
					luaBlockQuote(encodeBreakpoints(filename, breakpoints)),
					Buffer.from(")\n"),
				]));
			}
		});
		this.breakPointsChanged.clear();
		this.writeStdin(Buffer.concat(changes));
	}

	private async terminate() {
		this.factorio?.kill?.();
		const modsPath = this.launchArgs?.modsPath;
		if (modsPath) {
			if (this.launchArgs!.manageMod === false) {
				this.sendEvent(new OutputEvent(`automatic management of mods disabled by launch config\n`, "console"));
			} else {
				try {
					const manager = new ModManager(modsPath);
					await manager.Loaded;
					manager.set("debugadapter", false);
					await manager.write();
					this.sendEvent(new OutputEvent(`debugadapter disabled in mod-list.json\n`, "console"));
				} catch (error) {
					this.sendEvent(new OutputEvent(`failed to disable debugadapter in mod-list.json:\n${error}\n`, "console"));
				}
			}
		}
		this.sendEvent(new TerminatedEvent());
		// exit now if we're running standalone and collecting coverage data...
		if (!this._isRunningInline() && process.env["NODE_V8_COVERAGE"]) { process.exit(); }
	}
}
