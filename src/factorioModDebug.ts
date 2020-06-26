import {
	Logger, logger,
	LoggingDebugSession,
	TerminatedEvent, StoppedEvent, OutputEvent,
	Thread, Source, Handles, Module, ModuleEvent, InitializedEvent
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import * as path from 'path';
import { FactorioModRuntime, LaunchRequestArguments } from './factorioModRuntime';
import { Uri } from 'vscode';

export class FactorioModDebugSession extends LoggingDebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	private _runtime: FactorioModRuntime;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super();

		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);

		this._runtime = new FactorioModRuntime();

		// setup event handlers
		this._runtime.on('stopOnEntry', () => {
			this.sendEvent(new StoppedEvent('entry', FactorioModDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnStep', () => {
			this.sendEvent(new StoppedEvent('step', FactorioModDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnBreakpoint', () => {
			this.sendEvent(new StoppedEvent('breakpoint', FactorioModDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnException', (exceptionText:string) => {
			this.sendEvent(new StoppedEvent('exception', FactorioModDebugSession.THREAD_ID,exceptionText));
		});
		this._runtime.on('modules', (modules:Module[]) => {
			modules.forEach((module:Module) =>{
				this.sendEvent(new ModuleEvent('new', module));
			});
		});
		this._runtime.on('initialize', () => {
			this.sendEvent(new InitializedEvent());
		});
		this._runtime.on('output', (text, category, filePath, line, column, variablesReference) => {
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			if (category) {
				e.body.category = category;
			}
			if(variablesReference) {
				e.body.variablesReference = variablesReference;
			}
			if(filePath) {
				e.body.source = this.createSource(filePath);
			}
			if (line) {
				e.body.line = this.convertDebuggerLineToClient(line);
			}
			if (column) {
				e.body.column = this.convertDebuggerColumnToClient(column);
			}
			this.sendEvent(e);
		});
		this._runtime.on('end', () => {
			this.sendEvent(new TerminatedEvent());
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
			{ filter: "pcall",  label: "Caught by pcall",  default:false },
			{ filter: "xpcall", label: "Caught by xpcall", default:false },
			{ filter: "unhandled", label: "Unhandled Exceptions", default:true },
		];
		response.body.supportsSetVariable = true;
		response.body.supportsModulesRequest = true;
		response.body.supportsLogPoints = true;

		this.sendResponse(response);
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments): void {
		this._runtime.terminate();
		this.sendResponse(response);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this._runtime.terminate();
		this.sendResponse(response);
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

		// start the program in the runtime
		this._runtime.start(args);

		this.sendResponse(response);
	}


	protected convertClientPathToDebugger(clientPath: string): string
	{
		return this._runtime.convertClientPathToDebugger(clientPath);
	}
	protected convertDebuggerPathToClient(debuggerPath: string): string
	{
		return this._runtime.convertDebuggerPathToClient(debuggerPath);
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		let bpuri:Uri;
		let inpath = <string>args.source.path;
		if (inpath.match(/^[a-zA-Z]:/)) // matches c:\... or c:/... style windows paths, single drive letter
		{
			bpuri = Uri.parse("file:/"+inpath.replace(/\\/g,"/"));
		}
		else // everything else is already a URI
		{
			bpuri = Uri.parse(inpath);
		}
		const actualBreakpoints = this._runtime.setBreakPoints(
			this.convertClientPathToDebugger(bpuri.toString()),
			(args.breakpoints || []).map((bp)=>{
				bp.line = this.convertClientLineToDebugger(bp.line);
				return bp;
			})
			);

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		// runtime supports no threads so just return a default thread.
		response.body = {
			threads: [
				new Thread(FactorioModDebugSession.THREAD_ID, "thread 1")
			]
		};
		this.sendResponse(response);
	}

	protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
		const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
		const endFrame = startFrame + maxLevels;

		const stk = await this._runtime.stack(startFrame, endFrame);

		response.body = { stackFrames: (stk||[]).map(
			(frame) =>{
				if (frame && frame.source && frame.source.path)
				{
					frame.source.path = this.convertDebuggerPathToClient(frame.source.path);
				}
				return frame;
			}
		) };
		this.sendResponse(response);

	}

	protected async modulesRequest(response: DebugProtocol.ModulesResponse, args: DebugProtocol.ModulesArguments) {
		const modules = await this._runtime.modules();
		response.body = { modules: modules };
		this.sendResponse(response);
	}

	protected async scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
		const scopes = await this._runtime.scopes(args.frameId);
		response.body = { scopes: scopes };
		this.sendResponse(response);
	}

	protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {
		const vars = await this._runtime.vars(args.variablesReference,response.request_seq,args.filter,args.start,args.count);
		response.body = { variables: vars };
		this.sendResponse(response);
	}

	protected async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments, request?: DebugProtocol.Request) {
		response.body = await this._runtime.setVar(args, response.request_seq);
		this.sendResponse(response);
	}

	protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments, request?: DebugProtocol.Request) {
		response.body = await this._runtime.evaluate(args, response.request_seq);
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this._runtime.continue();
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this._runtime.step("over");
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
		this._runtime.step("in");
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
		this._runtime.step("out");
		this.sendResponse(response);
	}

	protected setExceptionBreakPointsRequest(response: DebugProtocol.SetExceptionBreakpointsResponse, args: DebugProtocol.SetExceptionBreakpointsArguments, request?: DebugProtocol.Request): void {
		this._runtime.setExceptionBreakpoints(args.filters);
		this.sendResponse(response);
	}

	private createSource(filePath: string): Source {
		return new Source(path.basename(filePath), this.convertDebuggerPathToClient(filePath));
	}
}
