/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { Breakpoint, Scope, Variable, StackFrame } from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
const { Subject } = require('await-notify');
import StreamSplitter = require('stream-splitter');

export interface FactorioPaths {
	_modsPath?: string; // absolute path of `mods` directory
	_dataPath?: string; // absolute path of `data` directory
	_factorioPath: string; // aboslute path of factorio binary to launch
}
/**
 * A Mock runtime with minimal debugger functionality.
 */
export class MockRuntime extends EventEmitter {

	// maps from sourceFile to array of Mock breakpoints
	private _breakPoints = new Map<string, DebugProtocol.SourceBreakpoint[]>();
	private _breakPointsChanged = new Map<string, boolean>();

	private _breakAddresses = new Set<string>();

	private _factorio : ChildProcess;

	private _stack = new Subject();
	private _scopes : any[] = [];
	private _vars : any[] = [];
	private _step = new Subject();
	private _bps = new Subject();

	private _paths? : FactorioPaths;

	public getPaths(){ return this._paths; }

	constructor() {
		super();
	}

	/**
	 * Start executing the given program.
	 */
	public start(stopOnEntry: boolean, paths: FactorioPaths) {
		this._paths = paths;
		this._factorio = spawn("D:\\factorio\\factoriogit\\bin\\FastDebugx64vs2017\\factorio-run.exe");
		console.log("Factorio Launched");
		let runtime = this;
		this._factorio.on("exit", function(code:number, signal:string){
			console.log("Factorio Closed");
			runtime.sendEvent('end');
		});
		this._factorio.stderr.on("data", async function(chunk:any){
			let chunkstr = chunk.toString();
			chunkstr = chunkstr.trim();
			//raise this as a stderr "Output" event
			runtime.sendEvent('output', chunkstr, "stderr");
		});
		const stdout = this._factorio.stdout.pipe(StreamSplitter("\n"));
		stdout.on("token", function(chunk:any){
			let chunkstr = chunk.toString().trim();
			console.log(chunkstr);
			if (chunkstr.startsWith("DBG: ")) {
				let event = chunkstr.substring(5).trim();
				if (event.startsWith("logpoint")) {
					// notify output of logpoint, these won't break
					runtime.sendEvent('output', chunkstr, "console");
				} else if (event === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					runtime._factorio.stdin.write("cont\n");
				} else if (event === "on_load" || event === "on_init") {
					//if on_load or on_init, set initial breakpoints and continue
					//if(stopOnEntry)
					//{
					//	runtime.sendEvent('stopOnEntry')
					//} else {
					//
					//}
					runtime._factorio.stdin.write("cont\n");
				} else if (event.startsWith("step")) {
					// notify stoponstep
					runtime.sendEvent('stopOnStep');
				} else if (event.startsWith("breakpoint")) {
					// notify stop on breakpoint
					runtime.sendEvent('stopOnBreakpoint');
				} else {
					// unexpected event?
					console.log("unexpected event: " + event);
					runtime._factorio.stdin.write("cont\n");
				}
			} else if (chunkstr.startsWith("DBGstack: ")) {
				runtime._stack.trace = JSON.parse(chunkstr.substring(10).trim());
				runtime._stack.notify();
			} else if (chunkstr.startsWith("DBGscopes: ")) {
				const scopes = JSON.parse(chunkstr.substring(11).trim());
				runtime._scopes[scopes.frameId].dump = scopes.scopes;
				runtime._scopes[scopes.frameId].notify();
			} else if (chunkstr.startsWith("DBGvars: ")) {
				const vars = JSON.parse(chunkstr.substring(9).trim());
				runtime._vars[vars.variablesReference].dump = vars.vars;
				runtime._vars[vars.variablesReference].notify();
			} else if (chunkstr.startsWith("DBGsetbp")) {

			} else if (chunkstr.startsWith("DBGstep")) {
				runtime._step.notify();
			} else {
				//raise this as a stdout "Output" event
				runtime.sendEvent('output', chunkstr, "stdout");
			}
		});
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
	public step(event = 'stopOnStep') {
		this.run(event);
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public async stack(startFrame: number, endFrame: number): Promise<StackFrame[]> {
		this._factorio.stdin.write("__DebugAdapter.stackTrace(" + startFrame + "," + (endFrame-startFrame) + ")\n");

		await this._stack.wait(1000);

		return this._stack.trace;
	}

	public async scopes(frameId: number): Promise<Scope[]> {
		this._scopes[frameId] = new Subject();
		this._factorio.stdin.write("__DebugAdapter.scopes(" + frameId + ")\n");

		await this._scopes[frameId].wait(1000);
		let dump = this._scopes[frameId].dump;
		delete this._scopes[frameId];

		return dump;
	}

	public async vars(variablesReference: number): Promise<Variable[]> {
		this._vars[variablesReference] = new Subject();
		this._factorio.stdin.write("__DebugAdapter.variables(" + variablesReference + ")\n");

		await this._vars[variablesReference].wait(1000);
		let dump = this._vars[variablesReference].dump;
		delete this._vars[variablesReference];

		return dump;
	}

	/*
	 * Set breakpoint in file with given line.
	 */
	public setBreakPoints(path: string, bps: DebugProtocol.SourceBreakpoint[] | undefined) : Breakpoint[] {

		this._breakPoints[path] = bps || [];
		this._breakPointsChanged[path] = true;

		return (bps || []).map((bp) => { return {line:bp.line, verified:true }; });

		//this._factorio.stdin.write("__DebugAdapter.setBreakpoints(" + path + ", " +
		//JSON.stringify(bps) + ")\n")
		//await this._bps.wait(1000)
		//return this._bps.dump;
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

	/**
	 * Run through the file.
	 * If stepEvent is specified only run a single step and emit the stepEvent.
	 */
	private run(stepEvent?: string) {
		if(stepEvent === 'stopOnStep')
		{
			this._factorio.stdin.write("__DebugAdapter.step()\n");
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