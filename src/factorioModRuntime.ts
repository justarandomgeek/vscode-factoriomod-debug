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


interface modentry{
	name: string;
	enabled: boolean;
}
interface modlist{
	mods: modentry[];
}

interface modinfo{
	name: string;
    version: string;
    factorio_version: string;
    title: string;
    author: string;
    homepage: string;
    contact: string;
    description: string;
    dependencies: string[];
}


interface modpaths{
	fspath: string;
	modpath: string;
}

export class FactorioModRuntime extends EventEmitter {

	private _breakPoints = new Map<string, DebugProtocol.SourceBreakpoint[]>();
	private _breakPointsChanged = new Set<string>();

	private _breakAddresses = new Set<string>();

	private _factorio : ChildProcess;

	private _stack = new Subject();
	private _modules = new Subject();
	private _scopes = new Map<number, any>();
	private _vars = new Map<number, any>();
	private _setvars = new Map<number, any>();
	private _evals = new Map<number, any>();
	private _step = new Subject();

	private _deferredevent: string;

	private modsPath?: string; // absolute path of `mods` directory
	private dataPath: string; // absolute path of `data` directory

	private modinfoready = new Subject();
	private modinfo = new Array<modpaths>();
	private infoWatcher:vscode.FileSystemWatcher;

	constructor() {
		super();
		vscode.workspace.findFiles('**/info.json')
			.then(infos=>{infos.forEach(this.updateInfoJson,this);})
			.then(()=>{this.modinfoready.notify()});
		this.infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		this.infoWatcher.onDidChange(this.updateInfoJson,this)
		this.infoWatcher.onDidCreate((info)=>{
			this.removeInfoJson(info);
			this.updateInfoJson(info);
		},this)
		this.infoWatcher.onDidDelete(this.removeInfoJson,this)
	}

	/**
	 * Start executing the given program.
	 */
	public async start(factorioPath: string, dataPath: string, modsPath?: string) {
		if (modsPath) //TODO: look for mod-list.json in workspace too and try from there?
		{
			this.modsPath = modsPath.replace(/\\/g,"/");
			// check for folder or symlink and leave it alone, if zip update if mine is newer
			const modlistpath = path.resolve(modsPath,"./mod-list.json")
			if (fs.existsSync(modlistpath))
			{
				let mods = fs.readdirSync(this.modsPath,"utf8");
				mods = mods.filter((mod)=>{
					return mod.startsWith("debugadapter")
				})
				if (mods.length == 0)
				{
					// install zip from package
					const ext = vscode.extensions.getExtension("justarandomgeek.factoriomod-debug")
					if (ext)
					{
						const extpath = ext.extensionPath
						const zippath = path.resolve(extpath, "./modpackage/debugadapter.zip")
						const infopath = path.resolve(extpath, "./modpackage/info.json")
						const dainfo:modinfo = JSON.parse(fs.readFileSync(infopath, "utf8"))
						fs.copyFileSync(zippath,path.resolve(modsPath,`./${dainfo.name}_${dainfo.version}.zip`))
						this.sendEvent('output', `installed ${dainfo.name}_${dainfo.version}.zip`, "stdout");
					}
				}
				else if (mods.length == 1)
				{
					if (mods[0].endsWith(".zip"))
					{
						// check version ??
						const ext = vscode.extensions.getExtension("justarandomgeek.factoriomod-debug")
						if (ext)
						{
							const extpath = ext.extensionPath

							const infopath = path.resolve(extpath, "./modpackage/info.json")
							const dainfo:modinfo = JSON.parse(fs.readFileSync(infopath, "utf8"))

							const existingVersion = mods[0].match(/_([0-9]+)\.([0-9]+)\.([0-9]+)\.zip/)
							const extensionVersion = dainfo.version.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/)

							if(
								existingVersion && extensionVersion && (
								Number(extensionVersion[1]) > Number(existingVersion[1]) || (
									Number(extensionVersion[1]) == Number(existingVersion[1]) &&
									Number(extensionVersion[2]) > Number(existingVersion[2]) || (
										Number(extensionVersion[2]) == Number(existingVersion[2]) &&
										Number(extensionVersion[3]) > Number(existingVersion[3])
										)
									)
								)
							)
							{
								const zippath = path.resolve(extpath, "./modpackage/debugadapter.zip")
								fs.unlinkSync(path.resolve(modsPath,mods[0]))
								fs.copyFileSync(zippath,path.resolve(modsPath,`./${dainfo.name}_${dainfo.version}.zip`))
								this.sendEvent('output', `updated ${mods[0]} to ${dainfo.name}_${dainfo.version}.zip`, "stdout");
							} else {
								this.sendEvent('output', `using existing ${mods[0]}`, "stdout");
							}
						}
					}
					else
					{
						this.sendEvent('output', "existing debugadapter in modsPath is not a zip", "stderr");
					}
				}
				else
				{
					this.sendEvent('output', "multiple debugadapters in modsPath", "stderr");
				}
				// enable in json
				let modlist:modlist = JSON.parse(fs.readFileSync(modlistpath, "utf8"))
				let isInList = false
				modlist.mods.map((modentry)=>{
					if (modentry.name == "debugadapter") {
						isInList = true;
						modentry.enabled = true;
					};
					return modentry;
				});
				if (!isInList){
					modlist.mods.push({name:"debugadapter",enabled:true})
				}
				fs.writeFileSync(modlistpath, JSON.stringify(modlist), "utf8")
				this.sendEvent('output', `enabled in mod-list.json`, "stdout");
			} else {
				this.sendEvent('output', "modsPath does not contain mod-list.json", "stderr");
			}

		} else {
			// warn that i can't check/add debugadapter
			this.sendEvent('output', "Cannot install/verify mod without modsPath", "stderr");
		}
		this.dataPath = dataPath.replace(/\\/g,"/");

		await this.modinfoready.wait(1000);

		let renamedbps = new Map<string, DebugProtocol.SourceBreakpoint[]>();
		this._breakPointsChanged.clear();
		this._breakPoints.forEach((bps:DebugProtocol.SourceBreakpoint[], path:string, map) => {
			const newpath = this.convertClientPathToDebugger(path);
			renamedbps.set(newpath, bps);
			this._breakPointsChanged.add(newpath);
		});
		this._breakPoints = renamedbps;
		this._factorio = spawn(factorioPath);
		this._factorio.on("exit", (code:number, signal:string) => {
			this.sendEvent('end');
		});
		const stderr = this._factorio.stderr.pipe(StreamSplitter("\n"));
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
		const stdout = this._factorio.stdout.pipe(StreamSplitter("\n"));
		stdout.on("token", (chunk:any) => {
			let chunkstr = chunk.toString().trim();
			if (chunkstr.startsWith("DBG: ")) {
				let event = chunkstr.substring(5).trim();
				if (event === "on_first_tick") {
					//on the first tick, update all breakpoints no matter what...
					this._deferredevent = "continue";
					this.updateBreakpoints(true);
				} else if (event === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					if(this._breakPointsChanged.size === 0)
					{
						this.continue();
					} else {
						this._deferredevent = "continue";
						this.updateBreakpoints();
					}
				} else if (event === "on_data") {
					//control.lua main chunk - force all breakpoints each time this comes up because it can only set them locally
					this._deferredevent = "continue";
					this.updateBreakpoints(true);
				} else if (event === "on_parse") {
					//control.lua main chunk - force all breakpoints each time this comes up because it can only set them locally
					this._deferredevent = "continue";
					this.updateBreakpoints(true);
				} else if (event === "on_init") {
					//if on_init, set initial breakpoints and continue
					this._deferredevent = "continue";
					this.updateBreakpoints(true);
				} else if (event === "on_load") {
					//on_load set initial breakpoints and continue
					this._deferredevent = "continue";
					this.updateBreakpoints(true);
				} else if (event.startsWith("step")) {
					// notify stoponstep
					if(this._breakPointsChanged.size === 0)
					{
						this.sendEvent('stopOnStep');
					} else {
						this._deferredevent = 'stopOnStep';
						this.updateBreakpoints();
					}
				} else if (event.startsWith("breakpoint")) {
					// notify stop on breakpoint
					if(this._breakPointsChanged.size === 0)
					{
						this.sendEvent('stopOnBreakpoint');
					} else {
						this._deferredevent = 'stopOnBreakpoint';
						this.updateBreakpoints();
					}
				} else {
					// unexpected event?
					console.log("unexpected event: " + event);
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
				let subj = this._vars.get(vars.variablesReference);
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
			} else if (chunkstr.startsWith("DBGsetbp")) {
				// do whatever event was put off to update breakpoints
				switch (this._deferredevent)
				{
					case "continue":
						this.continue();
						break;
					default:
						this.sendEvent(this._deferredevent);
						break;
				}
			} else if (chunkstr.startsWith("DBGstep")) {
				this._step.notify();
			} else {
				//raise this as a stdout "Output" event
				this.sendEvent('output', chunkstr, "stdout");
			}
		});
	}

	public terminate()
	{
		this._factorio.kill();
		const modsPath = this.modsPath
		if (modsPath) {
			const modlistpath = path.resolve(modsPath,"./mod-list.json")
			if (fs.existsSync(modlistpath))
			{
				let modlist:modlist = JSON.parse(fs.readFileSync(modlistpath, "utf8"))
				modlist.mods.map((modentry)=>{
					if (modentry.name == "debugadapter") {
						modentry.enabled = false;
					};
					return modentry;
				});
				fs.writeFileSync(modlistpath, JSON.stringify(modlist), "utf8")
				this.sendEvent('output', `disabled in mod-list.json`, "stdout");
			}
		}
	}

	/**
	 * Continue execution to the end/beginning.
	 */
	public continue() {
		this.run(undefined);
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public step(event = 'in') {
		this.run(event);
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public async stack(startFrame: number, endFrame: number): Promise<StackFrame[]> {
		this._factorio.stdin.write(`__DebugAdapter.stackTrace(${startFrame},${endFrame-startFrame})\n`);

		await this._stack.wait(1000);

		return this._stack.trace;
	}

	public async modules(): Promise<Module[]> {
		this._factorio.stdin.write(`__DebugAdapter.modules()\n`);

		await this._modules.wait(1000);

		return this._modules.modules;
	}

	public async scopes(frameId: number): Promise<Scope[]> {
		let subj = new Subject();
		this._scopes.set(frameId, subj);
		this._factorio.stdin.write(`__DebugAdapter.scopes(${frameId})\n`);

		await subj.wait(1000);
		let scopes:Scope[] = subj.scopes;
		this._scopes.delete(frameId);

		return scopes;
	}

	public async vars(variablesReference: number): Promise<Variable[]> {
		let subj = new Subject();
		this._vars.set(variablesReference, subj);
		this._factorio.stdin.write(`__DebugAdapter.variables(${variablesReference})\n`);

		await subj.wait(1000);
		let vars:Variable[] = subj.vars;
		this._vars.delete(variablesReference);

		return vars;
	}

	private luaBlockQuote(instring:string){
		const blockpad = "=".repeat((instring.match(/\]=*\]/g)||[])
			.map((matchstr)=>{return matchstr.length - 1})
			.reduce((prev,curr)=>{return Math.max(prev,curr)},
			// force one pad if the string ends with a square bracket as it will be confused with the close bracket
			instring.endsWith("]") ? 1 : 0));
		return `[${blockpad}[${instring}]${blockpad}]`;

	}

	public async setVar(args: DebugProtocol.SetVariableArguments, seq: number): Promise<Variable> {
		let subj = new Subject();
		this._setvars.set(seq, subj);
		this._factorio.stdin.write(`__DebugAdapter.setVariable(${args.variablesReference},${this.luaBlockQuote(args.name)},${this.luaBlockQuote(args.value)},${seq})\n`);

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
		this._factorio.stdin.write(`__DebugAdapter.evaluate(${args.frameId},"${args.context}",${this.luaBlockQuote(args.expression)},${seq})\n`);

		await subj.wait(1000);
		let evalresult = subj.evalresult;
		this._evals.delete(seq);

		return evalresult;
	}

	private async updateBreakpoints(updateAll:boolean = false) {
		let changes = "{";
		this._breakPoints.forEach((breakpoints:DebugProtocol.SourceBreakpoint[], filename:string) => {
			if (updateAll || this._breakPointsChanged.has(filename))
			{
				const breakpointsarray = breakpoints.map((sb)=>{
					const condition = sb.condition && `,condition=${this.luaBlockQuote(sb.condition)}` || ""
					const hitCondition = sb.hitCondition && `,hitCondition=${this.luaBlockQuote(sb.hitCondition)}` || ""
					const logMessage = sb.logMessage && `,logMessage=${this.luaBlockQuote(sb.logMessage)}` || ""
					return `{line=${sb.line}${condition}${hitCondition}${logMessage}}`;  });
				let breakpointsbody = ""
				if (breakpointsarray && breakpointsarray.length > 0)
				{
					breakpointsbody = breakpointsarray.reduce((prev,curr)=>{return prev + "," + curr});
				}
				changes += `[(${this.luaBlockQuote(filename)})]={${breakpointsbody}},`;
			}
		});
		changes += "}"
		this._breakPointsChanged.clear();
		this._factorio.stdin.write(`__DebugAdapter.updateBreakpoints(${changes})\n`,"utf8");
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

	/*
	 * Clear all data breakpoints.
	 */
	public clearAllDataBreakpoints(): void {
		this._breakAddresses.clear();
	}


	private updateInfoJson(uri:vscode.Uri)
	{
		let jsonpath = uri.path
		if (os.platform() == "win32" && jsonpath.startsWith("/")) {jsonpath = jsonpath.substr(1)}
		const moddata = JSON.parse(fs.readFileSync(jsonpath, "utf8"))
		this.modinfo.push({
			fspath: path.dirname(jsonpath),
			modpath: `MOD/${moddata.name}_${moddata.version}`
		});
	}
	private removeInfoJson(uri:vscode.Uri)
	{
		let jsonpath = uri.path;
		if (jsonpath.startsWith("/")) {
			jsonpath = jsonpath.substr(1);
		}
		this.modinfo = this.modinfo.filter((modinfo)=>{modinfo.fspath != path.dirname(jsonpath)});
	}

	public convertClientPathToDebugger(clientPath: string): string
	{
		clientPath = clientPath.replace(/\\/g,"/");

		let modinfo = this.modinfo.find((m)=>{return clientPath.startsWith(m.fspath);});
		if(modinfo)
		{
			return clientPath.replace(modinfo.fspath,modinfo.modpath)
		}

		if (this.dataPath && clientPath.startsWith(this.dataPath))
		{
			return clientPath.replace(this.dataPath,"DATA");
		}
		if (this.modsPath && clientPath.startsWith(this.modsPath))
		{
			return clientPath.replace(this.modsPath,"MOD");
		}
		return clientPath;
	}
	public convertDebuggerPathToClient(debuggerPath: string): string
	{
		let modinfo = this.modinfo.find((m)=>{return debuggerPath.startsWith(m.modpath);});
		if(modinfo)
		{
			return debuggerPath.replace(modinfo.modpath,modinfo.fspath)
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

	/**
	 * Run through the file.
	 * If stepEvent is specified only run a single step and emit the stepEvent.
	 */
	private run(stepEvent?: string) {
		if(stepEvent)
		{
			this._factorio.stdin.write(`__DebugAdapter.step("${stepEvent}")\n`);
			this._step.wait(1000).then(()=>{this._factorio.stdin.write("cont\n");});
		}
		else
		{
			this._factorio.stdin.write("cont\n");
		}
	}

	private sendEvent(event: string, ... args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}