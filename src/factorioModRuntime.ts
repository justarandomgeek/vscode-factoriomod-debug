import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Breakpoint, Scope, Variable, StackFrame, Module,} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { BufferSplitter } from './BufferSplitter';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Buffer } from 'buffer';
import { Profile } from './Profile';


interface ModEntry{
	name: string
	enabled: boolean
	version?: string
}
interface ModList{
	mods: ModEntry[]
}

interface ModInfo{
	name: string
    version: string
    factorio_version: string
    title: string
    author: string
    homepage: string
    contact: string
    description: string
    dependencies: string[]
}


interface ModPaths{
	fspath: string
	modpath: string
}

type HookMode = "debug"|"profile";


export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	factorioPath: string // path of factorio binary to launch
	modsPath: string // path of `mods` directory
	modsPathDetected?: boolean
	configPath: string // path to config.ini
	configPathDetected?: boolean
	dataPath: string // path of `data` directory, always comes from config.ini
	manageMod?: boolean
	useInstrumentMode?: boolean
	factorioArgs?: Array<string>
	adjustMods?:{[key:string]:boolean|string}
	disableExtraMods?:boolean
	allowDisableBaseMod?:boolean
	hookSettings?:boolean
	hookData?:boolean
	hookControl?:string[]|boolean
	hookMode?:HookMode

	profileSlowStart?: number
	profileUpdateRate?: number

	/** enable logging the Debug Adapter Protocol */
	trace?: boolean
}

interface EvaluateResponseBody {
	result: string
	type?: string
	presentationHint?: DebugProtocol.VariablePresentationHint
	variablesReference: number
	namedVariables?: number
	indexedVariables?: number

	// sequence number of this eval
	seq: number
	// translation ID for time this eval ran
	timer?: number
}

type resolver<T> = (value?: T | PromiseLike<T> | undefined)=>void;

export class FactorioModRuntime extends EventEmitter {

	private _breakPoints = new Map<string, DebugProtocol.SourceBreakpoint[]>();
	private _breakPointsChanged = new Set<string>();

	// unhandled only by default
	private _exceptionFilters = new Set<string>(["unhandled"]);

	private _breakAddresses = new Set<string>();

	private _factorio : ChildProcess;

	private _stack?: resolver<StackFrame[]>;
	private _modules?: resolver<Module[]>;
	private _scopes = new Map<number, resolver<Scope[]>>();
	private _vars = new Map<number, resolver<Variable[]>>();
	private _setvars = new Map<number, resolver<Variable>>();
	private _evals = new Map<number, resolver<EvaluateResponseBody>>();
	private translations = new Map<number, string>();

	private modsPath?: string; // absolute path of `mods` directory
	private dataPath: string; // absolute path of `data` directory
	private manageMod?: boolean;

	private hookSettings:boolean;
	private hookData:boolean;
	private hookControl:string[]|boolean;

	private hookMode:HookMode;
	private profile?: Profile;
	private profileSlowStart?: number;
	private profileUpdateRate?: number;

	private inPrompt:boolean = false;
	private trace:boolean;

	private hookLog?:boolean;
	private keepOldLog?:boolean;

	private workspaceModInfoReady:Promise<void>;
	private workspaceModInfo = new Array<ModPaths>();
	private workspaceModZips = new Array<ModPaths>();

	private workspaceModLists:Thenable<vscode.Uri[]>;

	private static output:vscode.OutputChannel;

	constructor() {
		super();
		FactorioModRuntime.output = FactorioModRuntime.output || vscode.window.createOutputChannel("Factorio Mod Debug");
		FactorioModRuntime.output.appendLine("---------------------------------------------------------------------------------------------------");
		this.workspaceModLists = vscode.workspace.findFiles("**/mod-list.json");
		this.workspaceModInfoReady = new Promise(async (resolve)=>{
			const infos = await vscode.workspace.findFiles('**/info.json');
			infos.forEach(this.updateInfoJson,this);
			resolve();
		});
		vscode.window.onDidChangeActiveTextEditor(editor =>{
			if (editor && this.profile)
			{
				const profname = this.convertClientPathToDebugger(editor.document.uri.fsPath);
				this.profile.render(editor,profname);
			}
		});
	}

	/**
	 * Start executing the given program.
	 */
	public async start(args: LaunchRequestArguments) {
		this.manageMod = args.manageMod;
		this.hookSettings = args.hookSettings ?? false;
		this.hookData = args.hookData ?? false;
		this.hookControl = args.hookControl ?? true;
		this.hookMode = args.hookMode ?? "debug";
		this.profileSlowStart = args.profileSlowStart;
		this.profileUpdateRate = args.profileUpdateRate;
		if (this.hookMode === "profile") {this.profile = new Profile();}
		this.trace = args.trace ?? false;
		FactorioModRuntime.output.appendLine(`using ${args.configPathDetected?"auto-detected":"manually-configured"} config.ini: ${args.configPath}`);
		const workspaceModLists = await this.workspaceModLists;
		if (workspaceModLists.length > 1)
		{
			FactorioModRuntime.output.appendLine(`multiple mod-list.json in workspace`);
		}
		else if (workspaceModLists.length === 1)
		{
			const workspaceModList = workspaceModLists[0].path;
			FactorioModRuntime.output.appendLine(`found mod-list.json in workspace: ${workspaceModList}`);
			args.modsPath = path.dirname(workspaceModList);
			args.modsPathDetected = false;
			if (os.platform() === "win32" && args.modsPath.startsWith("/")) {args.modsPath = args.modsPath.substr(1);}
		}
		if (args.modsPath)
		{
			this.modsPath = args.modsPath.replace(/\\/g,"/");
			// check for folder or symlink and leave it alone, if zip update if mine is newer
			const modlistpath = path.resolve(this.modsPath,"./mod-list.json");
			if (fs.existsSync(modlistpath))
			{
				FactorioModRuntime.output.appendLine(`using modsPath ${this.modsPath}`);
				if(args.manageMod === false)
				{
					FactorioModRuntime.output.appendLine(`automatic management of mods disabled`);
				}
				else
				{
					if (!args.adjustMods) {args.adjustMods = {};}
					if (!args.allowDisableBaseMod) {args.adjustMods["base"] = true;}
					const ext = vscode.extensions.getExtension("justarandomgeek.factoriomod-debug");
					if (ext)
					{
						const extpath = ext.extensionPath;

						const infopath = path.resolve(extpath, "./modpackage/info.json");
						const zippath = path.resolve(extpath, "./modpackage/debugadapter.zip");
						if(!(fs.existsSync(zippath) && fs.existsSync(infopath)))
						{
							FactorioModRuntime.output.appendLine(`debugadapter mod package missing in extension`);
						}
						else
						{
							const dainfo:ModInfo = JSON.parse(fs.readFileSync(infopath, "utf8"));

							let mods = fs.readdirSync(this.modsPath,"utf8");
							mods = mods.filter((mod)=>{
								return mod.startsWith(dainfo.name);
							});
							if (!args.noDebug)
							{
								args.adjustMods[dainfo.name] = dainfo.version;
								args.adjustMods["coverage"] = false;
								args.adjustMods["profiler"] = false;

								if (mods.length === 0)
								{
									// install zip from package
									fs.copyFileSync(zippath,path.resolve(args.modsPath,`./${dainfo.name}_${dainfo.version}.zip`));
									FactorioModRuntime.output.appendLine(`installed ${dainfo.name}_${dainfo.version}.zip`);
								}
								else if (mods.length === 1)
								{
									if (mods[0].endsWith(".zip"))
									{
										if(mods[0] === `${dainfo.name}_${dainfo.version}.zip`)
										{
											FactorioModRuntime.output.appendLine(`using existing ${mods[0]}`);
										} else {
											fs.unlinkSync(path.resolve(args.modsPath,mods[0]));
											fs.copyFileSync(zippath,path.resolve(args.modsPath,`./${dainfo.name}_${dainfo.version}.zip`));
											FactorioModRuntime.output.appendLine(`updated ${mods[0]} to ${dainfo.name}_${dainfo.version}.zip`);
										}
									}
									else
									{
										FactorioModRuntime.output.appendLine("existing debugadapter in modsPath is not a zip");
										const modinfopath = path.resolve(args.modsPath, mods[0], "./info.json");

										if(mods[0] !== `${dainfo.name}_${dainfo.version}` || !fs.existsSync(modinfopath))
										{
											FactorioModRuntime.output.appendLine(`existing debugadapter is wrong version or does not contain info.json`);
											fs.copyFileSync(zippath,path.resolve(args.modsPath,`./${dainfo.name}_${dainfo.version}.zip`));
											FactorioModRuntime.output.appendLine(`installed ${dainfo.name}_${dainfo.version}.zip`);
										}
										else
										{
											const info:ModInfo = JSON.parse(fs.readFileSync(modinfopath, "utf8"));
											if (info.version !== dainfo.version)
											{
												FactorioModRuntime.output.appendLine(`existing ${mods[0]} is wrong version`);
												fs.copyFileSync(zippath,path.resolve(args.modsPath,`./${dainfo.name}_${dainfo.version}.zip`));
												FactorioModRuntime.output.appendLine(`installed ${dainfo.name}_${dainfo.version}.zip`);
											}
										}
									}
								}
								else
								{
									FactorioModRuntime.output.appendLine("multiple debugadapters in modsPath");
									if (mods.find(s=> s === `${dainfo.name}_${dainfo.version}.zip` ))
									{
										FactorioModRuntime.output.appendLine(`using existing ${dainfo.name}_${dainfo.version}.zip`);
									}
									else if(mods.find(s=> s === `${dainfo.name}_${dainfo.version}` ))
									{
										FactorioModRuntime.output.appendLine(`using existing ${dainfo.name}_${dainfo.version}`);
									}
									else
									{
										fs.copyFileSync(zippath,path.resolve(args.modsPath,`./${dainfo.name}_${dainfo.version}.zip`));
										FactorioModRuntime.output.appendLine(`installed ${dainfo.name}_${dainfo.version}.zip`);
									}

								}
							}
							else
							{
								args.adjustMods[dainfo.name] = false;
							}

							// enable in json
							let modlist:ModList = JSON.parse(fs.readFileSync(modlistpath, "utf8"));

							let foundmods:{[key:string]:true} = {};
							modlist.mods = modlist.mods.map((modentry)=>{
								const adjust = args.adjustMods![modentry.name];

								if (adjust === true || adjust === false) {
									foundmods[modentry.name] = true;
									return {name:modentry.name,enabled:adjust};
								}
								else if (adjust) {
									foundmods[modentry.name] = true;
									return {name:modentry.name,enabled:true,version:adjust};
								}
								else if (args.disableExtraMods) {
									return {name:modentry.name,enabled:false};
								}

								return modentry;
							});

							for (const mod in args.adjustMods) {
								if (args.adjustMods.hasOwnProperty(mod) && !foundmods[mod])
								{
									const adjust = args.adjustMods[mod];
									if (adjust === true || adjust === false) {

										modlist.mods.push({name:mod,enabled:adjust});
									}
									else {

										modlist.mods.push({name:mod,enabled:true,version:adjust});
									}
								}
							}

							fs.writeFileSync(modlistpath, JSON.stringify(modlist), "utf8");
							FactorioModRuntime.output.appendLine(`debugadapter ${args.noDebug?"disabled":"enabled"} in mod-list.json`);
						}
					}
				}

				if (!args.noDebug)
				{
					const zipext = vscode.extensions.getExtension("slevesque.vscode-zipexplorer");
					if (zipext)
					{
						fs.readdirSync(this.modsPath,"utf8").filter(s => s.endsWith(".zip")).map(modzip => {
							const modzipinfo = {
								fspath: "zip:/" + path.resolve(this.modsPath!,modzip).replace(/\\/g,"/").replace(":","%3A") + "/" + modzip.replace(/\.zip$/,""),
								modpath: "MOD/" + modzip.replace(/\.zip$/,"")
							};
							let zipuri = vscode.Uri.parse("file:/"+ path.resolve(this.modsPath!,modzip).replace(/\\/g,"/"));
							vscode.commands.executeCommand("zipexplorer.exploreZipFile", zipuri);
							FactorioModRuntime.output.appendLine(`found mod zip "${modzip}" ${JSON.stringify(modzipinfo)}`);
							this.workspaceModZips.push(modzipinfo);
						});
					}
				}
			} else {
				FactorioModRuntime.output.appendLine(`modsPath "${this.modsPath}" does not contain mod-list.json`);
				this.modsPath = undefined;
			}
		} else {
			// warn that i can't check/add debugadapter
			FactorioModRuntime.output.appendLine("Cannot install/verify mod without modsPath");
		}
		this.dataPath = args.dataPath.replace(/\\/g,"/");
		FactorioModRuntime.output.appendLine(`using dataPath ${this.dataPath}`);

		await this.workspaceModInfoReady;

		let renamedbps = new Map<string, DebugProtocol.SourceBreakpoint[]>();
		this._breakPointsChanged.clear();
		this._breakPoints.forEach((bps:DebugProtocol.SourceBreakpoint[], path:string, map) => {
			const newpath = this.convertClientPathToDebugger(path);
			renamedbps.set(newpath, bps);
			this._breakPointsChanged.add(newpath);
		});
		this._breakPoints = renamedbps;
		args.factorioArgs = args.factorioArgs||[];
		if(!args.noDebug && (args.useInstrumentMode ?? true))
		{
			args.factorioArgs.push("--instrument-mod","debugadapter");
		}

		if (!args.configPathDetected)
		{
			args.factorioArgs.push("--config",args.configPath);
		}
		if (!args.modsPathDetected)
		{
			let mods = args.modsPath;
			if (!mods.endsWith("/"))
			{
				mods += "/";
			}
			args.factorioArgs.push("--mod-directory",mods);
		}
		this._factorio = spawn(args.factorioPath,args.factorioArgs);
		this._factorio.on("exit", (code:number, signal:string) => {
			if (this.profile)
			{
				this.profile.dispose();
				this.profile = undefined;
			}
			this.sendEvent('end');
		});

		const stderr = new BufferSplitter(this._factorio.stderr!,[Buffer.from("\n"),Buffer.from("lua_debug> ")]);
		stderr.on("segment", (chunk:Buffer) => {
			let chunkstr : string = chunk.toString();
			chunkstr = chunkstr.replace(/^[\r\n]*/,"").replace(/[\r\n]*$/,"");
			//raise this as a stderr "Output" event
			this.sendEvent('output', chunkstr, "stderr");
		});
		const stdout = new BufferSplitter(this._factorio.stdout!, [Buffer.from("\n"),{
				start: Buffer.from("***DebugAdapterBlockPrint***"),
				end: Buffer.from("***EndDebugAdapterBlockPrint***")}]);
		stdout.on("segment", (chunk:Buffer) => {
			let chunkstr:string = chunk.toString();
			chunkstr = chunkstr.replace(/^[\r\n]*/,"").replace(/[\r\n]*$/,"");
			if (!chunkstr) { return; }
			if (this.trace && chunkstr.startsWith("DBG")){this.sendEvent('output', `> ${chunkstr}`, "console");}
			if (chunkstr.startsWith("DBG: ")) {
				this.inPrompt = true;
				let event = chunkstr.substring(5).trim();
				if (event === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					this.continue();
				} else if (event === "on_data") {
					//control.lua main chunk - force all breakpoints each time this comes up because it can only set them locally
					this.continue(true);
				} else if (event === "on_parse") {
					//control.lua main chunk - force all breakpoints each time this comes up because it can only set them locally
					this.continue(true);
				} else if (event === "on_init") {
					//if on_init, set initial breakpoints and continue
					this.continue(true);
				} else if (event === "on_load") {
					//on_load set initial breakpoints and continue
					this.continue(true);
				} else if (event.startsWith("step")) {
					// notify stoponstep
					if(this._breakPointsChanged.size !== 0)
					{
						this.updateBreakpoints();
					}
					this.sendEvent('stopOnStep');
				} else if (event === "breakpoint") {
					// notify stop on breakpoint
					if(this._breakPointsChanged.size !== 0)
					{
						this.updateBreakpoints();
					}
					this.sendEvent('stopOnBreakpoint');
				} else if (event.startsWith("exception")) {
					// notify stop on exception
					const sub = event.substr(10);
					const split = sub.indexOf("\n");
					const filter = sub.substr(0,split).trim();
					const err = sub.substr(split+1);
					if (filter === "manual" || this._exceptionFilters.has(filter))
					{
						this.sendEvent('stopOnException', err);
					}
					else
					{
						this.continue();
					}
				} else if (event === "on_instrument_settings") {
					if (this.hookMode === "profile")
					{
						this.continueRequire(false);
					}
					else
					{
						this.continueRequire(this.hookSettings,this.hookLog,this.keepOldLog);
					}
				} else if (event === "on_instrument_data") {
					if (this.hookMode === "profile")
					{
						this.continueRequire(false);
					}
					else
					{
						this.continueRequire(this.hookData,this.hookLog,this.keepOldLog);
					}
				} else if (event.startsWith("on_instrument_control ")) {
					const modname = event.substring(22).trim();
					const hookmods = this.hookControl;
					const shouldhook = hookmods !== false && (hookmods === true || hookmods.includes(modname));
					if (this.hookMode === "profile")
					{
						this.continueProfile(shouldhook,this.profileSlowStart,this.profileUpdateRate);
					}
					else
					{
						this.continueRequire(shouldhook,this.hookLog,this.keepOldLog);
					}
				} else {
					// unexpected event?
					FactorioModRuntime.output.appendLine("unexpected event: " + event);
					this.continue();
				}
			} else if (chunkstr.startsWith("DBGlogpoint: ")) {
				const logpoint = JSON.parse(chunkstr.substring(13).trim());
				this.sendEvent('output', logpoint.output, "console", logpoint.filePath, logpoint.line, logpoint.variablesReference);
			} else if (chunkstr.startsWith("DBGprint: ")) {
				const body = JSON.parse(chunkstr.substring(10).trim());
				const lsid = body.output.match(/\{LocalisedString ([0-9]+)\}/);
				if (lsid)
				{
					const id = Number.parseInt(lsid[1]);
					body.output = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
				}
				this.sendEvent('output', body.output, body.category ?? "console", body.source, body.line);
			} else if (chunkstr.startsWith("DBGstack: ")) {
				this._stack!(JSON.parse(chunkstr.substring(10).trim()));
				this._stack = undefined;
			} else if (chunkstr.startsWith("DBGmodules: ")) {
				this._modules!(JSON.parse(chunkstr.substring(12).trim()));
				this._modules = undefined;
			} else if (chunkstr.startsWith("EVTmodules: ")) {
				const modules = JSON.parse(chunkstr.substring(12).trim());
				this.sendEvent('modules',modules);
			} else if (chunkstr.startsWith("DBGscopes: ")) {
				const scopes = JSON.parse(chunkstr.substring(11).trim());
				this._scopes.get(scopes.frameId)!(scopes.scopes);
				this._scopes.delete(scopes.frameId);
			} else if (chunkstr.startsWith("DBGvars: ")) {
				const vars = JSON.parse(chunkstr.substring(9).trim());
				this._vars.get(vars.seq)!(vars.vars);
				this._vars.delete(vars.seq);
			} else if (chunkstr.startsWith("DBGsetvar: ")) {
				const result = JSON.parse(chunkstr.substring(11).trim());
				this._setvars.get(result.seq)!(result.body);
				this._setvars.delete(result.seq);
			} else if (chunkstr.startsWith("DBGeval: ")) {
				const evalresult:EvaluateResponseBody = JSON.parse(chunkstr.substring(9).trim());
				const lsid = evalresult.result.match(/\{LocalisedString ([0-9]+)\}/);
				if (lsid)
				{
					const id = Number.parseInt(lsid[1]);
					evalresult.result = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
				}
				if (evalresult.timer)
				{
					const time = this.translations.get(evalresult.timer) ?? `{Missing Translation ID ${evalresult.timer}}`;
					evalresult.result += "\n⏱️ " + time.replace(/^.*: /,"");
				}

				this._evals.get(evalresult.seq)!(evalresult);
				this._evals.delete(evalresult.seq);
			} else if (chunkstr.startsWith("DBGtranslate: ")) {
				const sub = chunkstr.substr(14);
				const split = sub.indexOf("\n");
				const id = Number.parseInt(sub.substr(0,split).trim());
				const translation = sub.substr(split+1);
				this.translations.set(id,translation);
			} else if (chunkstr === "DBGuntranslate") {
				this.translations.clear();
			} else if (chunkstr.startsWith("PROFILE:")) {
				if (this.profile)
				{
					const editor = vscode.window.activeTextEditor;
					this.profile.parse(chunkstr);
					if (editor)
					{
						const profname = this.convertClientPathToDebugger(editor.document.uri.fsPath);
						this.profile.render(editor,profname);
					}
				}
			} else {
				//raise this as a stdout "Output" event
				this.sendEvent('output', chunkstr, "stdout");
			}
		});
	}

	public terminate()
	{
		if (this.profile)
		{
			this.profile.dispose();
			this.profile = undefined;
		}

		this._factorio.kill();
		try {
			// this covers some weird hangs on closing on macs and
			// seems to have no ill effects on windows, but try/catch
			// just in case...
			this._factorio.kill('SIGKILL');
		} catch (error) {}
		const modsPath = this.modsPath;
		if (modsPath) {
			const modlistpath = path.resolve(modsPath,"./mod-list.json");
			if (fs.existsSync(modlistpath))
			{
				if(this.manageMod === false)
				{
					FactorioModRuntime.output.appendLine(`automatic management of mods disabled`);
				}
				else
				{
					let modlist:ModList = JSON.parse(fs.readFileSync(modlistpath, "utf8"));
					modlist.mods.map((modentry)=>{
						if (modentry.name === "debugadapter") {
							modentry.enabled = false;
						};
						return modentry;
					});
					fs.writeFileSync(modlistpath, JSON.stringify(modlist), "utf8");
					FactorioModRuntime.output.appendLine(`debugadapter disabled in mod-list.json`);
				}
			}
		}
	}

	private writeStdin(s:string|Buffer):void
	{
		if (!this.inPrompt)
		{
			if (this.trace) { this.sendEvent('output', `!! Attempted to writeStdin "${s instanceof Buffer ? `Buffer[${s.length}]` : s}" while not in a prompt`, "console"); }
			return;
		}

		if (this.trace) { this.sendEvent('output', `< ${s instanceof Buffer ? `Buffer[${s.length}]` : s.replace(/^[\r\n]*/,"").replace(/[\r\n]*$/,"")}`, "console"); }
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(Buffer.concat([s instanceof Buffer ? s : Buffer.from(s),Buffer.from("\n")]));
	}

	/**
	 * Continue execution to the end/beginning.
	 */
	public continue(updateAllBreakpoints?:boolean) {
		if (!this.inPrompt)
		{
			if (this.trace) { this.sendEvent('output', `!! Attempted to continue while not in a prompt`, "console"); }
			return;
		}

		if(updateAllBreakpoints || this._breakPointsChanged.size !== 0)
		{
			this.updateBreakpoints(updateAllBreakpoints);
		}

		this.writeStdin("cont");
		this.inPrompt = false;
	}

	public continueRequire(shouldRequire:boolean,hookLog?:boolean,keepOldLog?:boolean) {
		if (!this.inPrompt)
		{
			if (this.trace) { this.sendEvent('output', `!! Attempted to continueRequire while not in a prompt`, "console"); }
			return;
		}
		if (shouldRequire) {
			let hookopts = "";
			if (hookLog !== undefined)
			{
				hookopts += `hooklog=${hookLog},`;
			}
			if (keepOldLog !== undefined)
			{
				hookopts += `keepoldlog=${keepOldLog},`;
			}

			this.writeStdin(`__DebugAdapter={${hookopts}}`);
		}

		this.writeStdin("cont");
		this.inPrompt = false;
	}

	public continueProfile(shouldRequire:boolean,slowStart?:number,updateRate?:number) {
		if (!this.inPrompt)
		{
			if (this.trace) { this.sendEvent('output', `!! Attempted to continueProfile while not in a prompt`, "console"); }
			return;
		}
		if (shouldRequire) {
			let hookopts = "";
			if (slowStart !== undefined)
			{
				hookopts += `slowStart=${slowStart},`;
			}
			if (updateRate !== undefined)
			{
				hookopts += `updateRate=${updateRate},`;
			}
			this.writeStdin(`__Profiler={${hookopts}}`);
		}

		this.writeStdin("cont");
		this.inPrompt = false;
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public step(event = 'in') {
		if(this._breakPointsChanged.size !== 0)
		{
			this.updateBreakpoints();
		}
		this.writeStdin(`__DebugAdapter.step("${event}")`);
		this.writeStdin("cont");
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public async stack(startFrame: number, endFrame: number): Promise<StackFrame[]> {
		return new Promise<StackFrame[]>((resolve)=>{
			this._stack = resolve;
			this.writeStdin(`__DebugAdapter.stackTrace(${startFrame},${endFrame-startFrame})`);
		});
	}

	public async modules(): Promise<Module[]> {
		return new Promise<Module[]>((resolve)=>{
			this._modules = resolve;
			this.writeStdin(`__DebugAdapter.modules()`);
		});
	}

	public async scopes(frameId: number): Promise<Scope[]> {
		return new Promise<Scope[]>((resolve)=>{
			this._scopes.set(frameId, resolve);
			this.writeStdin(`__DebugAdapter.scopes(${frameId})\n`);
		});
	}

	public async vars(variablesReference: number, seq: number, filter?: string, start?: number, count?: number): Promise<Variable[]> {
		let vars:Variable[] = await new Promise<Variable[]>((resolve)=>{
			this._vars.set(seq, resolve);
			this.writeStdin(`__DebugAdapter.variables(${variablesReference},${seq},${filter? `"${filter}"`:"nil"},${start || "nil"},${count || "nil"})\n`);
		});

		vars.forEach((a)=>{
			const lsid = a.value.match(/\{LocalisedString ([0-9]+)\}/);
			if (lsid)
			{
				const id = Number.parseInt(lsid[1]);
				a.value = this.translations.get(id) ?? `{Missing Translation ID ${id}}`;
			}
		});

		return vars;
	}

	private luaBlockQuote(inbuff:Buffer){
		const tailmatch = inbuff.toString().match(/\]=*$/);
		const blockpad = "=".repeat((inbuff.toString().match(/\]=*\]/g)||[])
			.map((matchstr)=>{return matchstr.length - 1;})
			.reduce((prev,curr)=>{return Math.max(prev,curr);},
			// force extra pad if the string ends with a square bracket followed by zero or more equals
			// as it will be confused with the close bracket
			tailmatch ? tailmatch[0].length : 0));

		return Buffer.concat([Buffer.from(`[${blockpad}[`), inbuff, Buffer.from(`]${blockpad}]`) ]);
	}

	public async setVar(args: DebugProtocol.SetVariableArguments, seq: number): Promise<Variable> {
		return new Promise<Variable>((resolve)=>{
			this._setvars.set(seq, resolve);
			this.writeStdin(`__DebugAdapter.setVariable(${args.variablesReference},${this.luaBlockQuote(Buffer.from(args.name))},${this.luaBlockQuote(Buffer.from(args.value))},${seq})\n`);
		});
	}

	public async evaluate(args: DebugProtocol.EvaluateArguments, seq: number): Promise<EvaluateResponseBody> {
		return new Promise<EvaluateResponseBody>((resolve)=>{
			if(args.context === "repl" && !args.frameId)
			{
				let evalresult = {result:"cannot evaluate while running",type:"error",variablesReference:0,seq:seq};
				resolve(evalresult);
			}

			this._evals.set(seq, resolve);
			this.writeStdin(`__DebugAdapter.evaluate(${args.frameId},"${args.context}",${this.luaBlockQuote(Buffer.from(args.expression.replace(/\n/g," ")))},${seq})\n`);
		});
	}

	private encodeVarInt(val:number) : Buffer {

		if (val === 10)
		{
			// escape \n
			val = 0xFFFFFFFF;
		} else if (val === 26) {
			val = 0xFFFFFFFE;
		} else if (val === 13) {
			val = 0xFFFFFFFD;
		}
		let prefix: number;
		let firstmask: number;
		let startshift: number;
		let bsize: number;

		if (val < 0x80)
		{
			//[[1 byte]]
			return Buffer.from([val]);
		}
		else if (val < 0x0800)
		{
			//[[2 bytes]]
			bsize = 2;
			prefix = 0xc0;
			firstmask = 0x1f;
			startshift = 6;
		}
		else if (val < 0x10000)
		{
			//[[3 bytes]]
			bsize = 3;
			prefix = 0xe0;
			firstmask = 0x0f;
			startshift = 12;
		}
		else if (val < 0x200000)
		{
			//[[4 bytes]]
			bsize = 4;
			prefix = 0xf0;
			firstmask = 0x07;
			startshift = 18;
		}
		else if (val < 0x4000000)
		{
			//[[5 bytes]]
			bsize = 5;
			prefix = 0xf8;
			firstmask = 0x03;
			startshift = 24;
		}
		else
		{
			//[[6 bytes]]
			bsize = 6;
			prefix = 0xfc;
			firstmask = 0x03;
			startshift = 30;
		}

		let buff = Buffer.alloc(bsize);
		// eslint-disable-next-line no-bitwise
		buff[0] = (prefix|((val>>startshift)&firstmask));
		for (let shift = startshift-6, i=1; shift >= 0; shift -= 6, i++) {
			// eslint-disable-next-line no-bitwise
			buff[i] = (0x80|((val>>shift)&0x3f));
		}
		return buff;
	}

	private encodeString(strval:string)
	{
		const sbuff = Buffer.from(strval,"utf8");
		const slength = this.encodeVarInt(sbuff.length);
		return Buffer.concat([slength,sbuff]);
	}

	private encodeBreakpoint(bp: DebugProtocol.SourceBreakpoint) : Buffer {
		let linebuff = this.encodeVarInt(bp.line);
		let hasExtra = 0;
		let extras = new Array<Buffer>();

		if (bp.condition)
		{
			// eslint-disable-next-line no-bitwise
			hasExtra |= 1;
			extras.push(this.encodeString(bp.condition.replace("\n"," ")));
		}

		if (bp.hitCondition)
		{
			// eslint-disable-next-line no-bitwise
			hasExtra |= 2;
			extras.push(this.encodeString(bp.hitCondition.replace("\n"," ")));
		}

		if (bp.logMessage)
		{
			// eslint-disable-next-line no-bitwise
			hasExtra |= 4;
			extras.push(this.encodeString(bp.logMessage.replace("\n"," ")));
		}

		return Buffer.concat([linebuff,Buffer.from([hasExtra]),Buffer.concat(extras)]);
	}

	private encodeBreakpoints(filename:string,breaks:DebugProtocol.SourceBreakpoint[]) : Buffer {
		const fnbuff = this.encodeString(filename);

		const plainbps = breaks.filter(bp => !bp.condition && !bp.hitCondition && !bp.logMessage).map(bp => bp.line);
		let plainbuff : Buffer;
		if (plainbps.length === 0)
		{
			plainbuff = Buffer.from([0xff]);
		}
		else if (plainbps.length === 10)
		{
			let countbuff = Buffer.from([0xfe]);
			plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => this.encodeVarInt(line)))]);
		}
		else if (plainbps.length === 26)
		{
			let countbuff = Buffer.from([0xfd]);
			plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => this.encodeVarInt(line)))]);
		}
		else if (plainbps.length === 13)
		{
			let countbuff = Buffer.from([0xfc]);
			plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => this.encodeVarInt(line)))]);
		}
		else
		{
			let countbuff = Buffer.from([plainbps.length]);
			plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => this.encodeVarInt(line)))]);
		}

		const complexbps = breaks.filter(bp => bp.condition || bp.hitCondition || bp.logMessage);
		let complexbuff : Buffer;
		if (complexbps.length === 0)
		{
			complexbuff = Buffer.from([0xff]);
		}
		else if (complexbps.length === 10)
		{
			let countbuff = Buffer.from([0xfe]);
			complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => this.encodeBreakpoint(bp)))]);
		}
		else if (complexbps.length === 26)
		{
			let countbuff = Buffer.from([0xfd]);
			complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => this.encodeBreakpoint(bp)))]);
		}
		else if (complexbps.length === 13)
		{
			let countbuff = Buffer.from([0xfc]);
			complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => this.encodeBreakpoint(bp)))]);
		}
		else
		{
			let countbuff = Buffer.from([complexbps.length]);
			complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => this.encodeBreakpoint(bp)))]);
		}

		return Buffer.concat([fnbuff,plainbuff,complexbuff]);
	}
	private updateBreakpoints(updateAll:boolean = false) {
		let changes = Array<Buffer>();

		this._breakPoints.forEach((breakpoints:DebugProtocol.SourceBreakpoint[], filename:string) => {
			if (updateAll || this._breakPointsChanged.has(filename))
			{
				changes.push(Buffer.concat([
					Buffer.from("__DebugAdapter.updateBreakpoints("),
					this.luaBlockQuote(this.encodeBreakpoints(filename,breakpoints)),
					Buffer.from(")\n")
				]));
			}
		});
		this._breakPointsChanged.clear();
		this.writeStdin(Buffer.concat(changes));
	}

	/*
	 * Set breakpoint in file with given line.
	 */
	public setBreakPoints(path: string, bps: DebugProtocol.SourceBreakpoint[] | undefined) : Breakpoint[] {

		this._breakPoints.set(path, bps || []);
		this._breakPointsChanged.add(path);

		return (bps || []).map((bp) => { return {line:bp.line, verified:true }; });
	}

	/*
	 * Set data breakpoint.
	 */
	public setDataBreakpoint(address: string): boolean {
		if (address) {
			this._breakAddresses.add(address);
			return true;
		}
		return false;
	}

	public setExceptionBreakpoints(filters: string[])
	{
		this._exceptionFilters.clear();
		filters.forEach(f=>this._exceptionFilters.add(f));
	}
	/*
	 * Clear all data breakpoints.
	 */
	public clearAllDataBreakpoints(): void {
		this._breakAddresses.clear();
	}


	private updateInfoJson(uri:vscode.Uri)
	{
		let jsonpath = uri.path;
		if (os.platform() === "win32" && jsonpath.startsWith("/")) {jsonpath = jsonpath.substr(1);}
		const moddata = JSON.parse(fs.readFileSync(jsonpath, "utf8"));
		const mp = {
			fspath: path.dirname(jsonpath),
			modpath: `MOD/${moddata.name}_${moddata.version}`
		};
		this.workspaceModInfo.push(mp);
		FactorioModRuntime.output.appendLine(`using mod in workspace ${JSON.stringify(mp)}`);
	}

	public convertClientPathToDebugger(clientPath: string): string
	{
		clientPath = clientPath.replace(/\\/g,"/");

		let modinfo = this.workspaceModInfo.find((m)=>{return clientPath.startsWith(m.fspath);});
		if(modinfo)
		{
			return clientPath.replace(modinfo.fspath,modinfo.modpath);
		}

		let modzip = this.workspaceModZips.find((m)=>{return clientPath.startsWith(m.fspath);});
		if(modzip)
		{
			return clientPath.replace(modzip.fspath,modzip.modpath);
		}

		if (this.dataPath && clientPath.startsWith(this.dataPath))
		{
			return clientPath.replace(this.dataPath,"DATA");
		}
		if (this.modsPath && clientPath.startsWith(this.modsPath))
		{
			return clientPath.replace(this.modsPath,"MOD");
		}

		FactorioModRuntime.output.appendLine(`unable to translate path ${clientPath}`);
		return clientPath;
	}
	public convertDebuggerPathToClient(debuggerPath: string): string
	{
		let modinfo = this.workspaceModInfo.find((m)=>{return debuggerPath.startsWith(m.modpath);});
		if(modinfo)
		{
			return debuggerPath.replace(modinfo.modpath,modinfo.fspath);
		}

		let modzip = this.workspaceModZips.find((m)=>{return debuggerPath.startsWith(m.modpath);});
		if(modzip)
		{
			const filepath = debuggerPath.replace(modzip.modpath,modzip.fspath);
			return filepath;
		}

		if (this.modsPath && debuggerPath.startsWith("MOD"))
		{
			return this.modsPath + debuggerPath.substring(3);
		}

		if (this.dataPath && debuggerPath.startsWith("DATA"))
		{
			return this.dataPath + debuggerPath.substring(4);
		}

		return debuggerPath;
	}

	private sendEvent(event: string, ... args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}
