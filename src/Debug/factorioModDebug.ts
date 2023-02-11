import {
	Logger, logger,
	LoggingDebugSession,
	StoppedEvent, OutputEvent,
	Thread, Source, Module, ModuleEvent, InitializedEvent, Scope, Variable, Event, TerminatedEvent, LoadedSourceEvent, BreakpointEvent,
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
	// sequence number of this eval
	seq: number
	// translation ID for time this eval ran
	timer?: number
};

type resolver<T> = (value: T | PromiseLike<T>)=>void;

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	modsPath?: string // path of `mods` directory
	manageMod?: boolean
	useInstrumentMode?: boolean
	checkPrototypes?: boolean
	checkGlobals?: string[]|boolean
	factorioArgs?: Array<string>
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

export class FactorioModDebugSession extends LoggingDebugSession {
	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	private _configurationDone?: resolver<void>;
	private configDone: Promise<void>;

	private nextBreakpointID = 1;
	private readonly breakPoints = new Map<string, (DebugProtocol.SourceBreakpoint&{id:number; verified:boolean})[]>();
	private readonly breakPointsChanged = new Set<string>();

	// unhandled only by default
	private readonly exceptionFilters = new Set<string>(["unhandled"]);

	private readonly _modules = new Map<string, DebugProtocol.Module>();

	private readonly _responses = new Map<number, DebugProtocol.Response>();

	private readonly _dumps = new Map<number, resolver<string>>();
	private readonly _scopes = new Map<number, resolver<Scope[]>>();
	private readonly _vars = new Map<number, resolver<Variable[]>>();
	private readonly _setvars = new Map<number, resolver<Variable>>();
	private readonly _evals = new Map<number, resolver<EvaluateResponseBody>>();
	private readonly translations = new Map<number, string>();
	private nextRef = 1;

	private factorio?: FactorioProcess;
	private stdinQueue:{buffer:Buffer;resolve:resolver<boolean>;consumed?:Promise<void>;signal?:AbortSignal}[] = [];

	private launchArgs?: LaunchRequestArguments;

	private inPrompt:boolean = false;
	private pauseRequested:boolean = false;

	private readonly workspaceModInfo:ModPaths[] = [];

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor(
		private readonly activeVersion: Pick<ActiveFactorioVersion, "configPathIsOverriden"|"defaultModsPath"|"configPath"|"dataPath"|"writeDataPath"|"factorioPath"|"nativeDebugger"|"docs">,
		private readonly fs: Pick<vscode.FileSystem, "readFile"|"writeFile"|"stat">,
		private readonly editorInterface: {
			readonly findWorkspaceFiles: typeof vscode.workspace.findFiles
			readonly getExtension?: typeof vscode.extensions.getExtension
			readonly executeCommand?: typeof vscode.commands.executeCommand
		}
	) {
		super();

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

		if (!args.noDebug) {
			if (args.useInstrumentMode ?? true) {
				args.factorioArgs.push("--instrument-mod", "debugadapter");
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
			this.fs.writeFile(modSettingsUri, settings.save());
		}

		this.factorio = new FactorioProcess(this.activeVersion.factorioPath, args.factorioArgs, this.activeVersion.nativeDebugger);

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

		this.factorio.on("stderr", (mesg:string)=>this.sendEvent(new OutputEvent(mesg+"\n", "stderr")));


		const otherStdout = async (mesg:string)=>{
			if (mesg.startsWith("DBG: ")) {
				const wasInPrompt = this.inPrompt;
				this.inPrompt = true;
				let event = mesg.substring(5).trim();
				if (event === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					await this.runQueuedStdin();
					this.continue();
				} else if (event === "on_data") {
					//data/settings main chunk - force all breakpoints each time this comes up because it can only set them locally
					await this.configDone;
					this.clearQueuedStdin();
					this.allocateRefBlock();
					this.continue(true);
				} else if (event === "on_parse") {
					//control.lua main chunk - force all breakpoints each time this comes up because it can only set them locally
					this.clearQueuedStdin();
					this.allocateRefBlock();
					this.continue(true);
				} else if (event === "on_init") {
					//if on_init, set initial breakpoints and continue
					await this.runQueuedStdin();
					this.continue(true);
				} else if (event === "on_load") {
					//on_load set initial breakpoints and continue
					await this.runQueuedStdin();
					this.continue(true);
				} else if (event === "getref") {
					//pass in nextref
					this.allocateRefBlock();
					this.continue();
					this.inPrompt = wasInPrompt;
				} else if (event === "object_info") {
					//pass in nextref
					this.sendClassData();
					// continue without trying to write breakpoints,
					// we're not ready for them yet...
					this.writeStdin("cont");
					this.inPrompt = false;
				} else if (event === "leaving" || event === "running") {
					//run queued commands
					await this.runQueuedStdin();
					if (this.pauseRequested) {
						this.pauseRequested = false;
						if (this.breakPointsChanged.size !== 0) {
							this.updateBreakpoints();
						}
						this.sendEvent(new StoppedEvent('pause', FactorioModDebugSession.THREAD_ID));
					} else {
						this.continue();
						this.inPrompt = wasInPrompt;
					}
				} else if (event === "terminate") {
					await this.terminate();
				} else if (event === "step") {
					// notify stoponstep
					await this.runQueuedStdin();
					if (this.breakPointsChanged.size !== 0) {
						this.updateBreakpoints();
					}
					this.sendEvent(new StoppedEvent('step', FactorioModDebugSession.THREAD_ID));
				} else if (event === "breakpoint") {
					// notify stop on breakpoint
					await this.runQueuedStdin();
					if (this.breakPointsChanged.size !== 0) {
						this.updateBreakpoints();
					}
					this.sendEvent(new StoppedEvent('breakpoint', FactorioModDebugSession.THREAD_ID));
				} else if (event.startsWith("exception")) {
					// notify stop on exception
					await this.runQueuedStdin();
					const sub = event.substr(10);
					const split = sub.indexOf("\n");
					const filter = sub.substr(0, split).trim();
					const err = sub.substr(split+1);
					if (filter === "manual" || this.exceptionFilters.has(filter)) {
						this.sendEvent(new StoppedEvent('exception', FactorioModDebugSession.THREAD_ID, err));
					} else {
						this.continue();
					}
				} else if (event === "on_instrument_settings") {
					await modulesReady;
					this.clearQueuedStdin();
					if (this.launchArgs!.hookMode === "profile") {
						this.continueRequire(false, "#settings");
					} else {
						this.continueRequire(this.launchArgs!.hookSettings ?? false, "#settings");
					}
				} else if (event === "on_instrument_data") {
					this.clearQueuedStdin();
					if (this.launchArgs!.hookMode === "profile") {
						this.continueRequire(false, "#data");
					} else {
						this.continueRequire(this.launchArgs!.hookData ?? false, "#data");
					}
				} else if (event.startsWith("on_instrument_control ")) {
					this.clearQueuedStdin();
					const modname = event.substring(22).trim();
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
				} else if (event === "on_da_control") {
					const hookmods = this.launchArgs!.hookControl ?? true;
					const dahooked = ((Array.isArray(hookmods) && hookmods.includes("debugadapter")) || hookmods === false);
					if (this.launchArgs!.hookMode === "profile") {
						this.continueProfile(!dahooked);
					} else {
						this.continueRequire(false, "debugadapter");
					}
				} else {
					// unexpected event?
					this.sendEvent(new OutputEvent("unexpected event: " + event + "\n", "stderr"));
					this.continue();
				}
			} else if (mesg.startsWith("DBGlogpoint: ")) {
				const body = JSON.parse(mesg.substring(13).trim());
				const e:DebugProtocol.OutputEvent = new OutputEvent(body.output+"\n", "console");
				if (body.variablesReference) {
					e.body.variablesReference = body.variablesReference;
				}
				if (body.source) {
					e.body.source = this.createSource(body.source);
				}
				if (body.line) {
					e.body.line = this.convertDebuggerLineToClient(body.line);
				}
				this.sendEvent(e);
			} else if (mesg.startsWith("DBGprint: ")) {
				const body = JSON.parse(mesg.substring(10).trim());
				const lsid = body.output.match(/\{LocalisedString ([0-9]+)\}/);
				if (lsid) {
					const id = Number.parseInt(lsid[1]);
					body.output = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
				}
				const e:DebugProtocol.OutputEvent = new OutputEvent(body.output+"\n", body.category ?? "console");
				if (body.variablesReference) {
					e.body.variablesReference = body.variablesReference;
				}
				if (body.source.path) {
					body.source.path = this.convertDebuggerPathToClient(body.source.path);
				}
				e.body.source = body.source;
				if (body.line) {
					e.body.line = this.convertDebuggerLineToClient(body.line);
				}
				this.sendEvent(e);
			} else if (mesg.startsWith("DBGstack: ")) {
				const stackresult:{frames:DebugProtocol.StackFrame[];seq:number} = JSON.parse(mesg.substring(10).trim());
				this.finishStackTrace(stackresult.frames, stackresult.seq);
			} else if (mesg.startsWith("DBGdump: ")) {
				const dump:{dump:string|undefined;source:string|undefined;ref:number} = JSON.parse(mesg.substring(9).trim());
				this.finishSource(dump);
			} else if (mesg.startsWith("EVTmodules: ")) {
				await this.updateModules(JSON.parse(mesg.substring(12).trim()));
				resolveModules();
				// and finally send the initialize event to get breakpoints and such...
				this.sendEvent(new InitializedEvent());
			} else if (mesg.startsWith("EVTsource: ")) {
				await this.loadedSourceEvent(JSON.parse(mesg.substring(11).trim()));
			} else if (mesg.startsWith("DBGscopes: ")) {
				const scopes = JSON.parse(mesg.substring(11).trim());
				this._scopes.get(scopes.frameId)?.(scopes.scopes);
				this._scopes.delete(scopes.frameId);
			} else if (mesg.startsWith("DBGvars: ")) {
				const vars = JSON.parse(mesg.substring(9).trim());
				this._vars.get(vars.seq)?.(vars.vars);
				this._vars.delete(vars.seq);
			} else if (mesg.startsWith("DBGsetvar: ")) {
				const result = JSON.parse(mesg.substring(11).trim());
				this._setvars.get(result.seq)?.(result.body);
				this._setvars.delete(result.seq);
			} else if (mesg.startsWith("DBGeval: ")) {
				const evalresult:EvaluateResponseBody = JSON.parse(mesg.substring(9).trim());
				this._evals.get(evalresult.seq)?.(evalresult);
				this._evals.delete(evalresult.seq);
			} else if (mesg.startsWith("DBGuntranslate: ")) {
				this.translations.clear();
			} else if (mesg.startsWith("PROFILE:")) {
				this.sendEvent(new Event("x-Factorio-Profile", mesg));
			} else {
				//raise this as a stdout "Output" event
				this.sendEvent(new OutputEvent(mesg+"\n", "stdout"));
			}
		};

		const idOnly = async (mesg:string)=>{

		};

		const translation = async (mesg:string)=>{
			// discard the tag
			mesg = mesg.slice(1);

			const split = mesg.indexOf("\x01");
			const id = Number.parseInt(mesg.slice(0, split).trim());
			const translation = mesg.slice(split+1);
			this.translations.set(id, translation);
		};

		const profile = async (mesg:string)=>{

		};

		this.factorio.on("stdout", (mesg:string)=>{
			switch (mesg.charCodeAt(0)) {
				case 0xFDD0:
					idOnly(mesg);
					return;
				case 0xFDD1:
				case 0xFDD2:
					return;

				case 0xFDD4:
					translation(mesg);
					return;
				case 0xFDD5:
				case 0xFDD6:
					return;


				case 0xFDE0: // profile line
				case 0xFDE1: // profile call
				case 0xFDE2: // profile tailcall
				case 0xFDE3: // profile return
					profile(mesg);
					return;

				default:
					otherStdout(mesg);
					return;
			}

		});

		this.sendResponse(response);
	}

	private allocateRefBlock() {
		const nextRef = this.nextRef;
		this.nextRef += 65536;
		this.writeStdin(`__DebugAdapter.transferRef(${nextRef})`);
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

		return super.convertDebuggerPathToClient(debuggerPath);
	}

	protected customRequest(command: string, response: DebugProtocol.Response, args: any, request?: DebugProtocol.Request | undefined): void {
		switch (command) {
			case "x-Factorio-ConvertPath":
				response.body = this.convertDebuggerPathToClient(args.path);
				break;
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

				return oldbp;
			}
			let verified = false;
			if (lines) {
				for (const line of lines) {
					if (line >= bp.line) {
						bp.line = line;
						verified = true;
						break;
					}
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
			for (const line of lines) {
				if (line >= bp.line) {
					bp.line = line;
					bp.verified = true;
					this.sendEvent(new BreakpointEvent("changed", bp));
					break;
				}
			}
		}
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		// runtime supports no threads so just return a default thread.
		response.body = {
			threads: [
				new Thread(FactorioModDebugSession.THREAD_ID, "thread 1"),
			],
		};
		this.sendResponse(response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;

		this._responses.set(response.request_seq, response);

		this.writeStdin(`__DebugAdapter.stackTrace(${startFrame},false,${response.request_seq})`);
	}

	private async finishStackTrace(stack:DebugProtocol.StackFrame[], seq:number) {
		const response = <DebugProtocol.StackTraceResponse> this._responses.get(seq);
		this._responses.delete(seq);
		response.body = { stackFrames: ((stack||[]) as (DebugProtocol.StackFrame&{linedefined:number; currentpc:number})[]).map(
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
			this._scopes.set(args.frameId, resolve);
			this.writeStdin(`__DebugAdapter.scopes(${args.frameId})\n`);
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
				this._vars.set(response.request_seq, resolve);
				if (!await this.writeOrQueueStdin(
					`__DebugAdapter.variables(${args.variablesReference},${response.request_seq},${args.filter? `"${args.filter}"`:"nil"},${args.start || "nil"},${args.count || "nil"})\n`,
					consumed,
					ac.signal)) {
					this._vars.delete(response.request_seq);
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
		vars.forEach((a)=>{
			const lsid = a.value.match(/\{LocalisedString ([0-9]+)\}/);
			if (lsid) {
				const id = Number.parseInt(lsid[1]);
				a.value = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
			}
		});
		response.body = { variables: vars };
		if (vars.length === 1 && vars[0].type === "error") {
			response.success = false;
			response.message = vars[0].value;
		}
		this.sendResponse(response);
	}

	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments, request?: DebugProtocol.Request) {
		const body = await new Promise<DebugProtocol.Variable>((resolve)=>{
			this._setvars.set(response.request_seq, resolve);
			this.writeStdin(`__DebugAdapter.setVariable(${args.variablesReference},${luaBlockQuote(Buffer.from(args.name))},${luaBlockQuote(Buffer.from(args.value))},${response.request_seq})\n`);
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
		const body = await Promise.race([
			new Promise<EvaluateResponseBody>(async (resolve)=>{
				this._evals.set(response.request_seq, resolve);
				if (!await this.writeOrQueueStdin(
					`__DebugAdapter.evaluate(${args.frameId??"nil"},"${args.context}",${luaBlockQuote(Buffer.from(args.expression.replace(/\n/g, " ")))},${response.request_seq})\n`,
					consumed,
					ac.signal)) {
					this._evals.delete(response.request_seq);
					consume!();
					resolve({
						result: `Expired evaluate seq=${response.request_seq}`,
						type: "error",
						variablesReference: 0,
						seq: response.request_seq,
					});
				}
			}),
			new Promise<EvaluateResponseBody>((resolve)=>{
				// just time out if we're in a menu with no lua running to empty the queue...
				// in which case it's just expired anyway
				setTimeout(()=>{
					ac.abort();
					resolve(<EvaluateResponseBody>{
						result: `No Lua State Available seq=${response.request_seq}`,
						type: "error",
						variablesReference: 0,
						seq: response.request_seq,
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
		const lsid = body.result.match(/\{LocalisedString ([0-9]+)\}/);
		if (lsid) {
			const id = Number.parseInt(lsid[1]);
			body.result = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
		}
		if (body.timer) {
			const time = this.translations.get(body.timer)?.replace(/^.*: /, "") ??
								`{Missing Translation ID ${body.timer}}`;
			body.result += "\n⏱️ " + time;
		}
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
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
		this.writeStdin(`__DebugAdapter.step(${stepdepth[event]},${granularity==="instruction"})`);
		this.writeStdin("cont");
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

	protected async loadedSourceEvent(loaded:{ source:Source&DebugProtocol.Source; dump?:string }) {
		const source = loaded.source;
		if (source.path) {
			source.path = this.convertDebuggerPathToClient(source.path);
		}

		if (loaded.dump) {
			const dumpid = source.sourceReference ?? source.name;
			const dump = new LuaFunction(new BufferStream(Buffer.from(loaded.dump, "base64")), true);
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
				lf.instructions.forEach(i=>lines.add(i.line));
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
				lf.baseAddr + lf.instructions.length >= start
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
		let sourceid = args.source.sourceReference ?? args.source.name;
		if (sourceid) {
			if (typeof sourceid === "string") {
				sourceid = this.convertDebuggerPathToClient(sourceid);
			}
			const lines = this.lines_by_source?.get(sourceid);
			if (lines) {
				response.body = {
					breakpoints: lines.map(l=>{ return {line: l}; }),
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
				new Promise<string>(async (resolve)=>{
					this._dumps.set(ref, resolve);
					if (!await this.writeOrQueueStdin(
						`__DebugAdapter.source(${ref})\n`,
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
			response.body = { content: body };
		}
		this.sendResponse(response);
	}
	private finishSource(dump:{dump:string|undefined;source:string|undefined;ref:number}) {
		let source:string;
		if (dump.dump) {
			const func = new LuaFunction(new BufferStream(Buffer.from(dump.dump, "base64")), true);
			source = func.getDisassembledSingleFunction();
		} else if (dump.source) {
			source = dump.source;
		} else {
			return this._dumps.get(dump.ref)?.("Invalid Source ID");
		}
		const resolver = this._dumps.get(dump.ref);
		this._dumps.delete(dump.ref);
		return resolver?.(source);
	}

	private createSource(filePath: string): Source {
		return new Source(path.basename(filePath), this.convertDebuggerPathToClient(filePath));
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

	private readonly objectInfoChunks: Buffer[]=bufferChunks(objectToLua(this.activeVersion.docs.generate_debuginfo()), 3500);
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

	private writeStdin(s:string|Buffer, fromQueue?:boolean):void {
		if (!this.inPrompt) {
			this.sendEvent(new OutputEvent(`!! Attempted to writeStdin "${s instanceof Buffer ? `Buffer[${s.length}]` : s}" while not in a prompt\n`, "console"));
			return;
		}

		this.factorio?.writeStdin(Buffer.concat([s instanceof Buffer ? s : Buffer.from(s), Buffer.from("\n")]));
	}

	private async writeOrQueueStdin(s:string|Buffer, consumed?:Promise<void>, signal?:AbortSignal):Promise<boolean> {
		const b = Buffer.concat([s instanceof Buffer ? s : Buffer.from(s), Buffer.from("\n")]);
		if (this.inPrompt) {
			this.factorio?.writeStdin(b);
			if (consumed) { await consumed; }
			return true;
		} else {
			const p = new Promise<boolean>((resolve)=>this.stdinQueue.push({buffer: b, resolve: resolve, consumed: consumed, signal: signal}));
			return p;
		}
	}

	private async runQueuedStdin() {
		if (this.stdinQueue.length > 0) {
			for await (const b of this.stdinQueue) {
				if (b.signal?.aborted) {
					b.resolve(false);
				} else {
					this.writeStdin(b.buffer, true);
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
		if (!this.inPrompt) {
			this.sendEvent(new OutputEvent(`!! Attempted to continue while not in a prompt\n`, "console"));
			return;
		}

		if (updateAllBreakpoints || this.breakPointsChanged.size !== 0) {
			this.updateBreakpoints(updateAllBreakpoints);
		}

		this.writeStdin("cont");
		this.inPrompt = false;
	}

	public continueRequire(shouldRequire:boolean, modname:string) {
		if (!this.inPrompt) {
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
			if (this.launchArgs!.checkGlobals !== undefined) {
				hookopts += `checkGlobals=${
					Array.isArray(this.launchArgs!.checkGlobals)?
						this.launchArgs!.checkGlobals.includes(modname):
						this.launchArgs!.checkGlobals},`;
			}

			this.writeStdin(`__DebugAdapter={${hookopts}}`);
		}

		this.writeStdin("cont");
		this.inPrompt = false;
	}

	public continueProfile(shouldRequire:boolean, version?:number) {
		if (!this.inPrompt) {
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
		this.inPrompt = false;
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
					Buffer.from("__DebugAdapter.updateBreakpoints("),
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
