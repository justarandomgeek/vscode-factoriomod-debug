import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { forkTest } from "./util";
import { setup, teardown, test, suite, suiteSetup } from "mocha";
import { DebugClient } from "@vscode/debugadapter-testsupport";
import type { LaunchRequestArguments } from "../src/Debug/factorioModDebug";
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import type { DebugProtocol } from '@vscode/debugprotocol';

chai.use(chaiAsPromised);

function exists(file:fs.PathLike) {
	return fsp.access(file, fs.constants.F_OK).then(()=>true).catch(()=>false);
}

suite('Debug Adapter', ()=>{
	let dc: DebugClient;
	const cwd = path.join(__dirname, "./factorio/mods");
	const fmtk = path.join(__dirname, '../dist/fmtk-cli.js');

	function launch(args:Partial<LaunchRequestArguments>, testid?:string) {
		return dc.launch(Object.assign({
			type: "factoriomod",
			request: "launch",
			adjustMods: {
				"debugadapter-tests": true,
				"minimal-no-base-mod": true,
			},
			adjustModSettings: [
				{
					scope: "startup",
					name: "dap-test-id",
					value: testid,
				},
			],
			disableExtraMods: true,
			allowDisableBaseMod: true,
		} as LaunchRequestArguments, args));
	}

	suiteSetup(async ()=>{
		await fsp.mkdir(cwd, {recursive: true });
		await fsp.copyFile(path.join(__dirname, "./empty-mod-settings.dat"), path.join(__dirname, "./factorio/mods/mod-settings.dat"));
		await forkTest(fmtk, ["mods", "install", "minimal-no-base-mod"], {cwd: cwd});

		// tests have to be dir-like for breakpoints to match up!
		if (!exists(path.join(cwd, "./debugadapter"))) {
			await fsp.symlink(path.join(__dirname, "../mod"), path.join(cwd, "./debugadapter"), 'dir');
		}
		if (!exists(path.join(cwd, "./debugadapter-tests"))) {
			await fsp.symlink(path.join(__dirname, "./mod"), path.join(cwd, "./debugadapter-tests"), 'dir');
		}
	});

	setup(async ()=>{
		dc = new DebugClient('node', fmtk, 'factoriomod', {
			cwd: cwd,
			env: Object.assign({},
				process.env,
				{
					FMTK_TEST_ARGV: JSON.stringify([
						"debug",
						path.join(__dirname, "./factorio/bin/x64/factorio.exe"),
					]),
				},
			),
			// for some reason not being detached makes factorio's stdin break (when it reopens it?)
			detached: true,
		});
		await dc.start();
		// long timeouts because we're loading factorio...
		dc.defaultTimeout = 30000;
		// or fake "socket" to disable timeouts
		//(dc as any)._socket = { end: ()=>{} };
	});

	teardown(async ()=>{
		// stop() kills it, which breaks coverage reporting...
		//await dc.stop();
	});

	test('should launch', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate"],
		});
		await dc.configurationSequence();
		await dc.waitForEvent('terminated');
	});

	test("should reject launch args", async ()=>{
		expect(launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--config"],
		})).eventually.throws();

		expect(launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--mod-directory"],
		})).eventually.throws();
	});

	test('should stop at breakpoint and step', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		let stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		let threadId = stopped.body.threadId!;
		const stack1 = await dc.stackTraceRequest({threadId});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).equals(2);
		await dc.stepInRequest({threadId});
		stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		threadId = stopped.body.threadId!;
		const stack2 = await dc.stackTraceRequest({threadId});
		expect(stack2.success);
		expect(stack2.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack2.body.stackFrames[0].line).equals(3);
		await dc.continueRequest({threadId});
		stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		threadId = stopped.body.threadId!;
		const stack3 = await dc.stackTraceRequest({threadId});
		expect(stack3.success);
		expect(stack3.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack3.body.stackFrames[0].line).equals(2);
		await dc.terminateRequest();
	});

	test('should adjust EOF breakpoint final active line', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 17 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		const threadId = stopped.body.threadId!;
		const stack1 = await dc.stackTraceRequest({threadId});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).lessThanOrEqual(17);
		await dc.terminateRequest();
	});


	test('should stop at breakpoint in settings', async ()=>{
		await launch({
			hookSettings: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/settings.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 1 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId", 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).equals(1);
		await dc.terminateRequest();
	});


	test('should stop at conditional breakpoint only if test is true', async ()=>{
		await launch({
			hookSettings: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/settings.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [
				{
					line: 1,
					condition: "not data",
				},
				{
					line: 2,
					condition: "not foo",
				},
				{
					line: 3,
					condition: "bar",
				},
				{
					line: 4,
					condition: "data",
				},
			],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId", 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).equals(4);
		await dc.terminateRequest();
	});

	test('should stop at breakpoint in data', async ()=>{
		await launch({
			hookData: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/data.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 1 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId", 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).equals(1);
		await dc.terminateRequest();
	});

	test('should list and validate breakpoint locations', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		await expect (dc.customRequest('breakpointLocations', {
			source: {
				path: scriptpath,
			},
			line: 1,
			endLine: 4,
		})).eventually.has.property('body').that.has.property('breakpoints').with.lengthOf(4);


		// skip 0 just for easy alignment...
		const validatedloc = [0,
			1, 2, 3, 4,
			9, 9, 9, 9, 9,
			10,
			15, 15, 15, 15, 15,
			// lines after end
			15, 15, 15,
		];
		for (let i = 1; i < validatedloc.length; i++) {
			const bps2 = await dc.setBreakpointsRequest({
				source: {
					path: scriptpath,
				},
				breakpoints: [ { line: i } ],
			});
			expect(bps2.body.breakpoints[0].line).equals(validatedloc[i]);
		}

		await dc.terminateRequest();
	});

	test('should list loaded modules and sources', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		await expect(dc.modulesRequest({})).eventually.has.property('body').has.property('modules');
		await expect(dc.customRequest('loadedSources', {})).eventually.has.property('body').has.property('sources');

		await dc.terminateRequest();
	});

	test('should catch exceptions', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/throw"],
		});
		await dc.waitForEvent('initialized');
		await dc.setExceptionBreakpointsRequest({filters: ['pcall', 'xpcall', 'unhandled']});
		await dc.configurationDoneRequest();

		async function waitFor(match:RegExp) {
			const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
			expect(stopped).has.property('body');
			expect(stopped.body).has.property("reason", "exception");
			expect(stopped.body).has.property('text').that.matches(match);
			expect(stopped.body).has.property("threadId").that.is.a('number');
			const threadId = stopped.body.threadId!;

			// don't actually care to inspect the stack now, just make sure it
			// really delivers one without throwing...
			await dc.stackTraceRequest({threadId});
		};

		await waitFor(/^Unknown interface: test-missing$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/^Unknown interface: test-missing2$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^remote1$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/debugadapter-tests\.error: remote1/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^remote2$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/debugadapter-tests\.error: remote2/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^remote3$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/level\.error: remote3/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/debugadapter-tests\.call:.+level\.error: remote3/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^remote4$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/level\.error: remote4/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/debugadapter-tests\.call:.+level\.error: remote4/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^premote1$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/^premote2$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/^premote3$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/^premote4$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/^pcall1$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/control\.lua:\d+: pcall2$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/control\.lua:\d+: xpcall$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/control\.lua:\d+: unhandled$/);

		await dc.terminateRequest();
	});

	test('should catch exception in data', async ()=>{
		await launch({
			hookData: true,
		}, "throw");
		await dc.waitForEvent('initialized');
		await dc.setExceptionBreakpointsRequest({filters: ['pcall', 'xpcall', 'unhandled']});
		await dc.configurationDoneRequest();

		async function waitFor(match:RegExp) {
			const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
			expect(stopped).has.property('body');
			expect(stopped.body).has.property("reason", "exception");
			expect(stopped.body).has.property('text').that.matches(match);
			expect(stopped.body).has.property("threadId", 1);

			// don't actually care to inspect the stack now, just make sure it
			// really delivers one without throwing...
			await dc.stackTraceRequest({threadId: 1});
		};

		await waitFor(/^pcall1$/);
		await dc.continueRequest({threadId: 1});
		await waitFor(/data\.lua:\d+: pcall2$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/data\.lua:\d+: xpcall$/);
		await dc.continueRequest({threadId: 1});

		await waitFor(/data\.lua:\d+: unhandled$/);

		await dc.terminateRequest();
	});

	test('should pause', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
			runningBreak: 1,
		} as LaunchRequestArguments);
		await dc.waitForEvent('initialized');
		await dc.setExceptionBreakpointsRequest({filters: ['pcall', 'xpcall', 'unhandled']});
		await dc.configurationDoneRequest();

		// wait a bit to let factorio actually get up and running before we try to pause...
		await new Promise((resolve)=>setTimeout(resolve, 500));

		await dc.pauseRequest({threadId: 1});
		await expect(dc.waitForEvent('stopped')).eventually.has.property('body')
			.that.contain({
				reason: 'pause',
			});

		await dc.terminateRequest();
	});

	test('should report scopes and variables', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		});
		expect(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		const threadId = stopped.body.threadId!;
		const threads = await dc.threadsRequest();
		expect(threads.body.threads).is.an("array");
		expect(threads.body.threads).deep.contains({id: threadId, name: "level"});


		const stack = await dc.stackTraceRequest({threadId, levels: 1});
		expect(stack.success);
		expect(stack.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack.body.stackFrames[0].line).equals(3);
		const frameId = stack.body.stackFrames[0].id;

		const scopes = await dc.scopesRequest({frameId: frameId });
		expect(scopes.success);
		expect(scopes.body.scopes).length(4);
		expect(scopes.body.scopes.map(s=>s.name)).contains.members([
			"Locals", "Upvalues", "Factorio global", "Lua Globals",
		]);

		const localsref = scopes.body.scopes.find(s=>s.name==="Locals")!.variablesReference;
		const locals = await dc.variablesRequest({variablesReference: localsref});
		expect(locals.success);
		expect(locals.body.variables[0]).deep.contains({
			name: '<temporaries>',
			value: '<temporaries>',
			presentationHint: { kind: 'virtual' },
		});
		expect(locals.body.variables[1]).contains({
			name: 'foo',
			value: 'true',
			type: 'boolean',
		});

		const setresult = await dc.setVariableRequest({
			variablesReference: localsref,
			name: 'foo',
			value: '42',
		});
		expect(setresult.success);
		expect(setresult.body.type).equals('number');
		expect(setresult.body.value).equals('42');

		await dc.terminateRequest();
	});

	test('should report scopes and variables in data', async ()=>{
		await launch({
			hookData: true,
		}, "scopes");
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/data.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		const threads = await dc.threadsRequest();
		expect(threads.body.threads).length(1);
		expect(threads.body.threads[0]).contains({id: 1, name: "data"});


		const stack = await dc.stackTraceRequest({threadId: 1, levels: 1});
		expect(stack.success);
		expect(stack.body.stackFrames[0].source?.path).equals(scriptpath);
		const frameId = stack.body.stackFrames[0].id;

		const scopes = await dc.scopesRequest({frameId: frameId });
		expect(scopes.success);
		expect(scopes.body.scopes).length(3);
		expect(scopes.body.scopes.map(s=>s.name)).contains.members([
			"Locals", "Upvalues", "Lua Globals",
		]);

		const localsref = scopes.body.scopes.find(s=>s.name==="Locals")!.variablesReference;
		const locals = await dc.variablesRequest({variablesReference: localsref});
		expect(locals.success);
		expect(locals.body.variables[0]).contains({
			name: 'foo',
			value: 'true',
			type: 'boolean',
		});
		expect(locals.body.variables[1]).contains({
			name: 'bar',
			value: 'false',
			type: 'boolean',
		});

		const setresult = await dc.setVariableRequest({
			variablesReference: localsref,
			name: 'foo',
			value: '42',
		});
		expect(setresult.success);
		expect(setresult.body.type).equals('number');
		expect(setresult.body.value).equals('42');

		await dc.terminateRequest();
	});

	test('should eval', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		await expect(dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		})).eventually.contain({ success: true });
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		const threadId = stopped.body.threadId!;
		const stack = await dc.stackTraceRequest({threadId, levels: 1});
		const frameId = stack.body.stackFrames[0].id;

		await Promise.all([
			expect(dc.evaluateRequest({
				context: 'repl',
				expression: 'foo',
				frameId: frameId,
			})).eventually.has.property("body").that.contain({
				type: 'boolean',
				variablesReference: 0,
			}).and.has.property("result").that.matches(/true\n⏱️ [\d\.]+ms/),

			expect(dc.evaluateRequest({
				context: 'repl',
				expression: 'foo',
			})).eventually.has.property("body").that.contain({
				type: 'nil',
				variablesReference: 0,
			}).and.has.property("result").that.matches(/nil\n⏱️ [\d\.]+ms/),

			expect(dc.evaluateRequest({
				context: 'test',
				expression: '"foo"',
			})).eventually.has.property("body").that.contain({
				type: 'string',
				variablesReference: 0,
				result: '"foo"',
			}),
		]);

		await dc.terminateRequest();
	});

	test('should eval LS translation', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		await expect(dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		})).eventually.contain({ success: true });
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');

		const result = await dc.evaluateRequest({
			context: 'test',
			expression: '{"","foo","bar"}',
		});
		expect(result.body.type).equals("table");

		const children = await dc.variablesRequest({
			variablesReference: result.body.variablesReference,
			filter: "named",
		});

		expect(children.body.variables[0]).contains({
			name: "<translated>",
			type: "LocalisedString",
			value: "foobar",
		});

		await dc.terminateRequest();
	});

	test('should reload ref IDs', async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
			runningTimeout: 30000,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		await expect(dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		})).eventually.contain({ success: true });
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		expect(stopped.body).has.property("threadId").that.is.a('number');
		const threadId = stopped.body.threadId!;

		const stack = await dc.stackTraceRequest({threadId, levels: 1});
		const frameId = stack.body.stackFrames[0].id;

		const result = await dc.evaluateRequest({
			context: 'repl',
			frameId: frameId,
			expression: `
			local t = {}
			for i = 1,5959 do t[i]={} end
			return t
			`,
		});

		for (let i = 0; i < 60; i++) {
			await expect(dc.variablesRequest({
				variablesReference: result.body.variablesReference,
				filter: "indexed",
				start: i * 100,
				count: 100,
			})).eventually.has.property("body").has.property("variables");
		}

		await dc.terminateRequest();
	});
});