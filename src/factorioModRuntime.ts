import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Breakpoint, Scope, Variable, StackFrame, Module,} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
const { Subject } = require('await-notify');
import StreamSplitter = require('stream-splitter');
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Buffer } from 'buffer';


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

	/** enable logging the Debug Adapter Protocol */
	trace?: boolean
}

export class FactorioModRuntime extends EventEmitter {

	private _breakPoints = new Map<string, DebugProtocol.SourceBreakpoint[]>();
	private _breakPointsChanged = new Set<string>();

	// unhandled only by default
	private _exceptionFilters = new Set<string>(["unhandled"]);

	private _breakAddresses = new Set<string>();

	private _factorio : ChildProcess;

	private _stack = new Subject();
	private _modules = new Subject();
	private _scopes = new Map<number, any>();
	private _vars = new Map<number, any>();
	private _setvars = new Map<number, any>();
	private _evals = new Map<number, any>();

	private modsPath?: string; // absolute path of `mods` directory
	private dataPath: string; // absolute path of `data` directory
	private manageMod?: boolean;

	private workspaceModInfoReady = new Subject();
	private workspaceModInfo = new Array<ModPaths>();
	private workspaceModListsReady = new Subject();
	private workspaceModLists = new Array<vscode.Uri>();

	private static output:vscode.OutputChannel;

	constructor() {
		super();
		FactorioModRuntime.output = FactorioModRuntime.output || vscode.window.createOutputChannel("Factorio Mod Debug");
		FactorioModRuntime.output.appendLine("---------------------------------------------------------------------------------------------------");
		vscode.workspace.findFiles("**/mod-list.json")
			.then((modlists)=>{this.workspaceModLists = modlists; this.workspaceModListsReady.notify();});
		vscode.workspace.findFiles('**/info.json')
			.then(infos=>{infos.forEach(this.updateInfoJson,this);})
			.then(()=>{this.workspaceModInfoReady.notify();});
	}

	/**
	 * Start executing the given program.
	 */
	public async start(args: LaunchRequestArguments) {
		this.manageMod = args.manageMod;
		FactorioModRuntime.output.appendLine(`using ${args.configPathDetected?"auto-detected":"manually-configured"} config.ini: ${args.configPath}`);
		await this.workspaceModListsReady.wait(1000);
		if (this.workspaceModLists.length > 1)
		{
			FactorioModRuntime.output.appendLine(`multiple mod-list.json in workspace`);
		}
		else if (this.workspaceModLists.length === 1)
		{
			const workspaceModList = this.workspaceModLists[0].path;
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
					FactorioModRuntime.output.appendLine(`automatic management of debugadapter mod disabled`);
				}
				else
				{
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

							// enable in json
							let modlist:ModList = JSON.parse(fs.readFileSync(modlistpath, "utf8"));

							if (args.noDebug)
							{
								let isInList = false;
								modlist.mods = modlist.mods.map((modentry)=>{
									if (modentry.name === dainfo.name) {
										isInList = true;
										return {name:modentry.name,enabled:false};
									};
									return modentry;
								});
								if (!isInList){
									modlist.mods.push({name:dainfo.name,enabled:false});
								}
							}
							else
							{
								let isInList = false;
								modlist.mods = modlist.mods.map((modentry)=>{
									if (modentry.name === dainfo.name) {
										isInList = true;
										return {name:modentry.name,enabled:true,version:dainfo.version};
									} else if(modentry.name === "coverage" || modentry.name === "profiler"){
										if (modentry.enabled) {
											FactorioModRuntime.output.appendLine(`incompatible mod "${modentry.name}" disabled`);
										}
										return {name:modentry.name,enabled:false};
									};
									return modentry;
								});
								if (!isInList){
									modlist.mods.push({name:dainfo.name,enabled:true,version:dainfo.version});
								}
							}
							fs.writeFileSync(modlistpath, JSON.stringify(modlist), "utf8");
							FactorioModRuntime.output.appendLine(`debugadapter ${args.noDebug?"disabled":"enabled"} in mod-list.json`);
						}
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

		await this.workspaceModInfoReady.wait(1000);

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
			this.sendEvent('end');
		});
		const stderr = this._factorio.stderr?.pipe(StreamSplitter("\n"));
		stderr.on("token", (chunk:any) => {
			let chunkstr : string = chunk.toString();
			chunkstr = chunkstr.replace(/lua_debug>/g,"");
			chunkstr = chunkstr.trim();
			if (chunkstr.length > 0 )
			{
				//raise this as a stderr "Output" event
				this.sendEvent('output', chunkstr, "stderr");
			}
		});
		const stdout = this._factorio.stdout?.pipe(StreamSplitter("\n"));
		stdout.on("token", (chunk:any) => {
			let chunkstr:string = chunk.toString();
			if (chunkstr.startsWith("DBG: ")) {
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
					const split = sub.indexOf(" ");
					const filter = sub.substr(0,split);
					const err = sub.substr(split+1);
					if (filter === "manual" || this._exceptionFilters.has(filter))
					{
						this.sendEvent('stopOnException', err);
					}
					else
					{
						this.continue();
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
				this.sendEvent('output', body.output, "console", body.source, body.line);
			} else if (chunkstr.startsWith("DBGstack: ")) {
				this._stack.trace = JSON.parse(chunkstr.substring(10).trim());
				this._stack.notify();
			} else if (chunkstr.startsWith("DBGmodules: ")) {
				this._modules.modules = JSON.parse(chunkstr.substring(12).trim());
				this._modules.notify();
			} else if (chunkstr.startsWith("EVTmodules: ")) {
				const modules = JSON.parse(chunkstr.substring(12).trim());
				this.sendEvent('modules',modules);
			} else if (chunkstr.startsWith("DBGscopes: ")) {
				const scopes = JSON.parse(chunkstr.substring(11).trim());
				let subj = this._scopes.get(scopes.frameId);
				subj.scopes = scopes.scopes;
				subj.notify();
			} else if (chunkstr.startsWith("DBGvars: ")) {
				const vars = JSON.parse(chunkstr.substring(9).trim());
				let subj = this._vars.get(vars.seq);
				subj.vars = vars.vars;
				subj.notify();
			} else if (chunkstr.startsWith("DBGsetvar: ")) {
				const result = JSON.parse(chunkstr.substring(11).trim());
				let subj = this._setvars.get(result.seq);
				subj.setvar = result.body;
				subj.notify();
			} else if (chunkstr.startsWith("DBGeval: ")) {
				const evalresult = JSON.parse(chunkstr.substring(9).trim());
				let subj = this._evals.get(evalresult.seq);
				subj.evalresult = evalresult;
				subj.notify();
			} else {
				//raise this as a stdout "Output" event
				this.sendEvent('output', chunkstr, "stdout");
			}
		});
	}

	public terminate()
	{
		this._factorio.kill();
		try {
			// this covers some weird hangs on closing on macs and
			// seems to have no ill effects on windows, but try/catch
			// just in case...
			this._factorio.kill();
		} catch (error) {}
		const modsPath = this.modsPath;
		if (modsPath) {
			const modlistpath = path.resolve(modsPath,"./mod-list.json");
			if (fs.existsSync(modlistpath))
			{
				if(this.manageMod === false)
				{
					FactorioModRuntime.output.appendLine(`automatic management of debugadapter mod disabled`);
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

	/**
	 * Continue execution to the end/beginning.
	 */
	public continue(updateAllBreakpoints?:boolean) {
		if(updateAllBreakpoints || this._breakPointsChanged.size !== 0)
		{
			this.updateBreakpoints(updateAllBreakpoints);
		}
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write("cont\n");
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public step(event = 'in') {
		if(this._breakPointsChanged.size !== 0)
		{
			this.updateBreakpoints();
		}
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.step("${event}")\n`);
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write("cont\n");
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public async stack(startFrame: number, endFrame: number): Promise<StackFrame[]> {
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.stackTrace(${startFrame},${endFrame-startFrame})\n`);

		await this._stack.wait(1000);

		return this._stack.trace;
	}

	public async modules(): Promise<Module[]> {
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.modules()\n`);

		await this._modules.wait(1000);

		return this._modules.modules;
	}

	public async scopes(frameId: number): Promise<Scope[]> {
		let subj = new Subject();
		this._scopes.set(frameId, subj);
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.scopes(${frameId})\n`);

		await subj.wait(1000);
		let scopes:Scope[] = subj.scopes;
		this._scopes.delete(frameId);

		return scopes;
	}

	public async vars(variablesReference: number, seq: number, filter?: string, start?: number, count?: number): Promise<Variable[]> {
		let subj = new Subject();
		this._vars.set(seq, subj);
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.variables(${variablesReference},${seq},${filter? `"${filter}"`:"nil"},${start || "nil"},${count || "nil"})\n`);

		await subj.wait(1000);
		let vars:Variable[] = subj.vars;
		this._vars.delete(seq);

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
		let subj = new Subject();
		this._setvars.set(seq, subj);
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.setVariable(${args.variablesReference},${this.luaBlockQuote(Buffer.from(args.name))},${this.luaBlockQuote(Buffer.from(args.value))},${seq})\n`);

		await subj.wait(1000);
		let setvar:Variable = subj.setvar;
		this._setvars.delete(seq);

		return setvar;
	}

	public async evaluate(args: DebugProtocol.EvaluateArguments, seq: number): Promise<any> {
		if(args.context === "repl" && !args.frameId)
		{
			let evalresult = {result:"cannot evaluate while running",type:"error",variablesReference:0};
			return evalresult;
		}

		let subj = new Subject();
		this._evals.set(seq, subj);
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(`__DebugAdapter.evaluate(${args.frameId},"${args.context}",${this.luaBlockQuote(Buffer.from(args.expression.replace(/\n/g," ")))},${seq})\n`);

		await subj.wait(1000);
		let evalresult = subj.evalresult;
		this._evals.delete(seq);

		return evalresult;
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
		// eslint-disable-next-line no-unused-expressions
		this._factorio.stdin?.write(Buffer.concat(changes));
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