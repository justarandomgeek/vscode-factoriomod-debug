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

	private _lastEvent : string;
	private _nextEvent = new Subject();

	private _stack = new Subject();
	private _scopes = new Subject();
	private _vars = new Subject();
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
		this._paths = paths
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
			console.log(chunkstr);
			if (chunkstr === "lua_debug>") {
				console.log(runtime._lastEvent);
				if (!runtime._lastEvent)
				{
					await runtime._nextEvent.wait(1000);
				}
				console.log(runtime._lastEvent);
				if (runtime._lastEvent === "on_tick") {
					//if on_tick, then update breakpoints if needed and continue
					runtime._lastEvent = "";
					runtime._factorio.stdin.write("cont\n");
				} else if (runtime._lastEvent === "on_load" || runtime._lastEvent === "on_init") {
					//if on_load or on_init, set initial breakpoints and continue
					//if(stopOnEntry)
					//{
					//	runtime.sendEvent('stopOnEntry')
					//} else {
					//
					//}
					runtime._lastEvent = "";
					runtime._factorio.stdin.write("cont\n");
				} else if (runtime._lastEvent.startsWith("step")) {
					// notify stoponstep
					runtime.sendEvent('stopOnStep');
				} else if (runtime._lastEvent.startsWith("breakpoint")) {
					// notify stop on breakpoint
					runtime.sendEvent('stopOnBreakpoint');
				} else if (runtime._lastEvent === "internal") {
					runtime._lastEvent = "";
				} else {
					// unexpected event?
					console.log("unexpected event: " + runtime._lastEvent);
					runtime._lastEvent = "";
					runtime._factorio.stdin.write("cont\n");
				}
			}
			else
			{
				//raise this as a stderr "Output" event
				runtime.sendEvent('output', chunkstr, "stderr");
			}
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
				} else {
					runtime._lastEvent = event;
					runtime._nextEvent.notify();
				}
			} else if (chunkstr.startsWith("DBGstack: ")) {
				runtime._lastEvent = 'internal';
				let trace = JSON.parse(chunkstr.substring(10).trim());
				runtime._stack.trace = trace;
				runtime._stack.notify();
			} else if (chunkstr.startsWith("DBGscopes: ")) {
				runtime._lastEvent = 'internal';
				let dump = JSON.parse(chunkstr.substring(11).trim());
				runtime._scopes.dump = dump;
				runtime._scopes.notify();
			} else if (chunkstr.startsWith("DBGvars: ")) {
				runtime._lastEvent = 'internal';
				runtime._vars.dump = JSON.parse(chunkstr.substring(9).trim());
				runtime._vars.notify();
			} else if (chunkstr.startsWith("DBGsetbp")) {
				runtime._lastEvent = 'internal';
			} else if (chunkstr.startsWith("DBGstep")) {
				runtime._lastEvent = 'internal';
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
		this._factorio.stdin.write("__DebugAdapter.scopes(" + frameId + ")\n");

		await this._scopes.wait(1000);

		return this._scopes.dump;
	}

	public async vars(variablesReference: number): Promise<Variable[]> {
		this._factorio.stdin.write("__DebugAdapter.variables(" + variablesReference + ")\n");

		await this._vars.wait(1000);

		return this._vars.dump;
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