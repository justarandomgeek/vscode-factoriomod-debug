import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, OutputEvent,
	Thread, Source, Handles, Module, ModuleEvent
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
import { FactorioModRuntime } from './factorioModRuntime';
const { Subject } = require('await-notify');

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	factorioPath: string; // absolute path of factorio binary to launch
	modsPath?: string; // absolute path of `mods` directory
	dataPath: string; // absolute path of `data` directory
	manageMod?: boolean;
	factorioArgs?: Array<string>;

	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
}

export class FactorioModDebugSession extends LoggingDebugSession {

	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	private _runtime: FactorioModRuntime;

	private _variableHandles = new Handles<string>();

	private _configurationDone = new Subject();

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super("factoriomod-debug.txt");

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
		this._runtime.on('stopOnDataBreakpoint', () => {
			this.sendEvent(new StoppedEvent('data breakpoint', FactorioModDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnException', (exceptionText:string) => {
			this.sendEvent(new StoppedEvent('exception', FactorioModDebugSession.THREAD_ID,exceptionText));
		});
		this._runtime.on('modules', (modules:Module[]) => {
			modules.forEach((module:Module) =>{
				this.sendEvent(new ModuleEvent('new', module));
			});
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

		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;

		// make VS Code to support data breakpoints
		response.body.supportsDataBreakpoints = false;

		// make VS Code to send cancelRequests
		response.body.supportsCancelRequest = false;

		// make VS Code send the breakpointLocations request
		response.body.supportsBreakpointLocationsRequest = false;

		// the adapter implements logpoints
		response.body.supportsLogPoints = true;

		response.body.supportsSetVariable = true;
		response.body.supportsModulesRequest = true;

		this.sendResponse(response);

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());
	}

	protected terminateRequest(response: DebugProtocol.TerminateResponse, args: DebugProtocol.TerminateArguments): void {
		this._runtime.terminate();
		this.sendResponse(response);
	}

	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments): void {
		this._runtime.terminate();
		this.sendResponse(response);
	}

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

		// notify the launchRequest that configuration has finished
		this._configurationDone.notify();
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

		// wait until configuration has finished (and configurationDoneRequest has been called)
		await this._configurationDone.wait(1000);

		// start the program in the runtime
		this._runtime.start(args.factorioPath, args.dataPath, args.modsPath, args.manageMod, args.noDebug, args.factorioArgs);


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

		let path = <string>args.source.path;
		path = this.convertClientPathToDebugger(path);
		const actualBreakpoints = this._runtime.setBreakPoints(path,
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

		response.body = { stackFrames: stk.map(
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

	protected dataBreakpointInfoRequest(response: DebugProtocol.DataBreakpointInfoResponse, args: DebugProtocol.DataBreakpointInfoArguments): void {

		response.body = {
            dataId: null,
            description: "cannot break on data access",
            accessTypes: undefined,
            canPersist: false
        };

		if (args.variablesReference && args.name) {
			const id = this._variableHandles.get(args.variablesReference);
			if (id.startsWith("global_")) {
				response.body.dataId = args.name;
				response.body.description = args.name;
				response.body.accessTypes = [ "read" ];
				response.body.canPersist = false;
			}
		}

		this.sendResponse(response);
	}

	protected setDataBreakpointsRequest(response: DebugProtocol.SetDataBreakpointsResponse, args: DebugProtocol.SetDataBreakpointsArguments): void {

		// clear all data breakpoints
		this._runtime.clearAllDataBreakpoints();

		response.body = {
			breakpoints: []
		};

		for (let dbp of args.breakpoints) {
			// assume that id is the "address" to break on
			const ok = this._runtime.setDataBreakpoint(dbp.dataId);
			response.body.breakpoints.push({
				verified: ok
			});
		}

		this.sendResponse(response);
	}

	//---- helpers

	private createSource(filePath: string): Source {
		return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath));
	}
}
