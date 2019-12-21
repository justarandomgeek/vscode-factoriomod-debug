import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Breakpoint, Scope, Variable, StackFrame, Module } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
const { Subject } = require('await-notify');
import StreamSplitter = require('stream-splitter');

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

	private modsPath: string; // absolute path of `mods` directory
	private dataPath: string; // absolute path of `data` directory

	constructor() {
		super();
	}

	/**
	 * Start executing the given program.
	 */
	public start(factorioPath: string, modsPath: string, dataPath: string) {
		this.modsPath = modsPath.replace(/\\/g,"/");
		this.dataPath = dataPath.replace(/\\/g,"/");

		let renamedbps = new Map<string, DebugProtocol.SourceBreakpoint[]>();
		this._breakPointsChanged.clear();
		this._breakPoints.forEach((bps:DebugProtocol.SourceBreakpoint[], path:string, map) => {
			const newpath = this.convertClientPathToDebugger(path);
			renamedbps.set(newpath, bps);
			this._breakPointsChanged.add(newpath);
		});
		this._breakPoints = renamedbps;
		this._factorio = spawn(factorioPath);
		let runtime = this;
		this._factorio.on("exit", function(code:number, signal:string){
			runtime.sendEvent('end');
		});
		this._factorio.stderr.on("data", function(chunk:any){
			let chunkstr : string = chunk.toString();
			chunkstr = chunkstr.replace(/lua_debug>/g,"");
			chunkstr = chunkstr.trim();
			if (chunkstr.length > 0 )
			{
				//raise this as a stderr "Output" event
				runtime.sendEvent('output', chunkstr, "stderr");
			}
		});
		const stdout = this._factorio.stdout.pipe(StreamSplitter("\n"));
		stdout.on("token", function(chunk:any){
			let chunkstr = chunk.toString().trim();
			if (chunkstr.startsWith("DBG: ")) {
				let event = chunkstr.substring(5).trim();
				if (event === "on_first_tick") {
					//on the first tick, update all breakpoints no matter what...
					runtime._deferredevent = "continue";
					runtime.updateBreakpoints(true);
				} else if (event === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					if(runtime._breakPointsChanged.size === 0)
					{
						runtime.continue();
					} else {
						runtime._deferredevent = "continue";
						runtime.updateBreakpoints();
					}
				} else if (event === "on_init") {
					//if on_init, set initial breakpoints and continue
					runtime._deferredevent = "continue";
					runtime.updateBreakpoints(true);
				} else if (event === "on_load") {
					//on_load can't set initial breakpoints
					runtime.continue();
				} else if (event.startsWith("step")) {
					// notify stoponstep
					if(runtime._breakPointsChanged.size === 0)
					{
						runtime.sendEvent('stopOnStep');
					} else {
						runtime._deferredevent = 'stopOnStep';
						runtime.updateBreakpoints();
					}
				} else if (event.startsWith("breakpoint")) {
					// notify stop on breakpoint
					if(runtime._breakPointsChanged.size === 0)
					{
						runtime.sendEvent('stopOnBreakpoint');
					} else {
						runtime._deferredevent = 'stopOnBreakpoint';
						runtime.updateBreakpoints();
					}
				} else {
					// unexpected event?
					console.log("unexpected event: " + event);
					runtime.continue();
				}
			} else if (chunkstr.startsWith("DBGlogpoint: ")) {
				const logpoint = JSON.parse(chunkstr.substring(13).trim());
				runtime.sendEvent('output', logpoint.output, "console", logpoint.filePath, logpoint.line, logpoint.variablesReference);
			} else if (chunkstr.startsWith("DBGstack: ")) {
				runtime._stack.trace = JSON.parse(chunkstr.substring(10).trim());
				runtime._stack.notify();
			} else if (chunkstr.startsWith("DBGmodules: ")) {
				runtime._modules.modules = JSON.parse(chunkstr.substring(12).trim());
				runtime._modules.notify();
			} else if (chunkstr.startsWith("EVTmodules: ")) {
				const modules = JSON.parse(chunkstr.substring(12).trim());
				runtime.sendEvent('modules',modules);
			} else if (chunkstr.startsWith("DBGscopes: ")) {
				const scopes = JSON.parse(chunkstr.substring(11).trim());
				let subj = runtime._scopes.get(scopes.frameId);
				subj.scopes = scopes.scopes;
				subj.notify();
			} else if (chunkstr.startsWith("DBGvars: ")) {
				const vars = JSON.parse(chunkstr.substring(9).trim());
				let subj = runtime._vars.get(vars.variablesReference);
				subj.vars = vars.vars;
				subj.notify();
			} else if (chunkstr.startsWith("DBGsetvar: ")) {
				const result = JSON.parse(chunkstr.substring(11).trim());
				let subj = runtime._setvars.get(result.seq);
				subj.setvar = result.body;
				subj.notify();
			} else if (chunkstr.startsWith("DBGeval: ")) {
				const evalresult = JSON.parse(chunkstr.substring(9).trim());
				let subj = runtime._evals.get(evalresult.seq);
				subj.evalresult = evalresult;
				subj.notify();
			} else if (chunkstr.startsWith("DBGsetbp")) {
				// do whatever event was put off to update breakpoints
				switch (runtime._deferredevent)
				{
					case "continue":
						runtime.continue();
						break;
					default:
						runtime.sendEvent(runtime._deferredevent);
						break;
				}
			} else if (chunkstr.startsWith("DBGstep")) {
				runtime._step.notify();
			} else {
				//raise this as a stdout "Output" event
				runtime.sendEvent('output', chunkstr, "stdout");
			}
		});
	}

	public terminate()
	{
		this._factorio.kill();
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
			.reduce((prev,curr)=>{return Math.max(prev,curr)},0));
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
		let changes = {};
		this._breakPoints.forEach((breakpoints:DebugProtocol.SourceBreakpoint[], filename:string) => {
			if (updateAll || this._breakPointsChanged.has(filename))
			{
				changes[filename] = breakpoints;
			}
		});
		this._breakPointsChanged.clear();
		this._factorio.stdin.write(`remote.call("debugadapter", "updateBreakpoints", ${this.luaBlockQuote(JSON.stringify(changes))})\n`);
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

	// private methods

	public convertClientPathToDebugger(clientPath: string): string
	{
		clientPath = clientPath.replace(/\\/g,"/");

		if (this.dataPath)
		{
			clientPath = clientPath.replace(this.dataPath,"DATA");
		}
		if (this.modsPath)
		{
			clientPath = clientPath.replace(this.modsPath,"MOD");
		}
		return clientPath;
	}
	public convertDebuggerPathToClient(debuggerPath: string): string
	{
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