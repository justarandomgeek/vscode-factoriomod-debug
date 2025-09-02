import * as path from "path";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { test, suite, before, beforeEach, afterEach } from "node:test";
import assert from 'node:assert/strict';
import { DebugClient } from "@vscode/debugadapter-testsupport";
import type { LaunchRequestArguments } from "../src/Debug/factorioModDebug.ts";
import type { DebugProtocol } from '@vscode/debugprotocol';
import { forkTest } from "./util.ts";

function exists(file:fs.PathLike) {
	return fsp.access(file, fs.constants.F_OK).then(()=>true).catch(()=>false);
}

const timeout = 60000;

await suite('Debug Adapter', async ()=>{
	let dc: DebugClient;
	const cwd = path.join(import.meta.dirname, "./factorio/mods");
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');

	function launch(args:Partial<LaunchRequestArguments>, testid?:string) {
		return dc.launch(Object.assign({
			type: "factoriomod",
			request: "launch",
			adjustMods: {
				"debugadapter-tests": true,
				"remove-animations": true,
				//"minimal-no-base-mod": true,
			},
			adjustModSettings: [
				{
					scope: "startup",
					name: "dap-test-id",
					value: testid,
				},
			],
			disableExtraMods: true,
			//allowDisableBaseMod: true,
		} as LaunchRequestArguments, args));
	}

	before(async ()=>{
		await fsp.mkdir(cwd, {recursive: true });
		await fsp.copyFile(path.join(import.meta.dirname, "./empty-mod-settings.dat"), path.join(import.meta.dirname, "./factorio/mods/mod-settings.dat"));
		await forkTest(fmtk, ["mods", "install", "remove-animations"], {cwd: cwd});
		//await forkTest(fmtk, ["mods", "install", "minimal-no-base-mod"], {cwd: cwd});

		// tests have to be dir-like for breakpoints to match up!
		if (!(await exists(path.join(cwd, "./debugadapter")))) {
			await fsp.symlink(path.join(import.meta.dirname, "../mod"), path.join(cwd, "./debugadapter"), 'dir');
		}
		if (!(await exists(path.join(cwd, "./debugadapter-tests")))) {
			await fsp.symlink(path.join(import.meta.dirname, "./mod"), path.join(cwd, "./debugadapter-tests"), 'dir');
		}
	});

	beforeEach(async ()=>{
		dc = new DebugClient('node', fmtk, 'factoriomod', {
			cwd: cwd,
			env: Object.assign({},
				process.env,
				{
					FMTK_TEST_ARGV: JSON.stringify([
						"debug",
						path.join(import.meta.dirname, "./factorio/bin/x64/factorio.exe"),
					]),
				},
			),
			// for some reason not being detached makes factorio's stdin break (when it reopens it?)
			detached: true,
		});
		await dc.start();
		dc.defaultTimeout = timeout;
	});

	afterEach(async ()=>{
		//await dc.stop();
	});

	await test('should launch', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate"],
		});
		await dc.configurationSequence();
		await dc.waitForEvent('terminated');
	});

	//TODO: these two don't work properly with the fast termination...
	await test.skip("should reject --config", { timeout }, async ()=>{
		await assert.rejects(launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--config"],
		}));
	});
	await test.skip("should reject --mod-directory", { timeout }, async ()=>{
		await assert.rejects(launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--mod-directory"],
		}));
	});

	await test('should stop at breakpoint and step', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		let stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		let threadId = stopped.body.threadId!;
		const stack1 = await dc.stackTraceRequest({threadId});
		assert(stack1.success);
		assert.equal(stack1.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack1.body.stackFrames[0].line, 2);
		await dc.stepInRequest({threadId});
		stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		threadId = stopped.body.threadId!;
		const stack2 = await dc.stackTraceRequest({threadId});
		assert(stack2.success);
		assert.equal(stack2.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack2.body.stackFrames[0].line, 3);
		await dc.continueRequest({threadId});
		stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		threadId = stopped.body.threadId!;
		const stack3 = await dc.stackTraceRequest({threadId});
		assert(stack3.success);
		assert.equal(stack3.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack3.body.stackFrames[0].line, 2);
		await dc.terminateRequest();
	});

	await test('should adjust EOF breakpoint final active line', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 17 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		const threadId = stopped.body.threadId!;
		const stack1 = await dc.stackTraceRequest({threadId});
		assert(stack1.success);
		assert.equal(stack1.body.stackFrames[0].source?.path, scriptpath);
		assert(stack1.body.stackFrames[0].line <= 17);
		await dc.terminateRequest();
	});


	await test('should stop at breakpoint in settings', { timeout }, async ()=>{
		await launch({
			hookSettings: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/settings.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 1 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.threadId, 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		assert(stack1.success);
		assert.equal(stack1.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack1.body.stackFrames[0].line, 1);
		await dc.terminateRequest();
	});


	await test('should stop at conditional breakpoint only if test is true', { timeout }, async ()=>{
		await launch({
			hookSettings: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/settings.lua");
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
		assert(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.threadId, 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		assert(stack1.success);
		assert.equal(stack1.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack1.body.stackFrames[0].line, 4);
		await dc.terminateRequest();
	});

	await test('should stop at breakpoint in data', { timeout }, async ()=>{
		await launch({
			hookData: true,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/data.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 1 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.threadId, 1);
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		assert(stack1.success);
		assert.equal(stack1.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack1.body.stackFrames[0].line, 1);
		await dc.terminateRequest();
	});

	await test('should list and validate breakpoint locations', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		const bplocs = await dc.customRequest('breakpointLocations', {
			source: {
				path: scriptpath,
			},
			line: 1,
			endLine: 4,
		}) as DebugProtocol.BreakpointLocationsResponse;
		assert.equal(bplocs.body.breakpoints.length, 4);

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
			assert.equal(bps2.body.breakpoints[0].line, validatedloc[i]);
		}

		await dc.terminateRequest();
	});

	await test('should list loaded modules and sources', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 2 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		const modules = await dc.modulesRequest({});
		assert(modules.body.modules);
		const sources = await dc.customRequest('loadedSources', {}) as DebugProtocol.LoadedSourcesResponse;
		assert(sources.body.sources);

		await dc.terminateRequest();
	});

	await test('should catch exceptions', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/throw"],
		});
		await dc.waitForEvent('initialized');
		await dc.setExceptionBreakpointsRequest({filters: ['pcall', 'xpcall', 'unhandled']});
		await dc.configurationDoneRequest();

		async function waitFor(match:RegExp) {
			const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
			assert(stopped.body);
			assert.equal(stopped.body.reason, "exception");
			assert(stopped.body.text);
			assert.match(stopped.body.text, match);
			assert.equal(typeof stopped.body.threadId, 'number');
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

	await test('should catch exception in data', { timeout }, async ()=>{
		await launch({
			hookData: true,
		}, "throw");
		await dc.waitForEvent('initialized');
		await dc.setExceptionBreakpointsRequest({filters: ['pcall', 'xpcall', 'unhandled']});
		await dc.configurationDoneRequest();

		async function waitFor(match:RegExp) {
			const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
			assert(stopped.body);
			assert.equal(stopped.body.reason, "exception");
			assert(stopped.body.text);
			assert.match(stopped.body.text, match);
			assert.equal(stopped.body.threadId, 1);

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

	await test('should pause', { timeout }, async ()=>{
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
		const stopped = await dc.waitForEvent('stopped') as DebugProtocol.StoppedEvent;
		assert.equal(stopped.body.reason, 'pause');

		await dc.terminateRequest();
	});

	await test('should report scopes and variables', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		});
		assert(bps.success);
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		const threadId = stopped.body.threadId!;
		const threads = await dc.threadsRequest();
		assert(threads.body.threads.find((t)=>t.id === threadId && t.name==="level"));

		const stack = await dc.stackTraceRequest({threadId, levels: 1});
		assert(stack.success);
		assert.equal(stack.body.stackFrames[0].source?.path, scriptpath);
		assert.equal(stack.body.stackFrames[0].line, 3);
		const frameId = stack.body.stackFrames[0].id;

		const scopes = await dc.scopesRequest({frameId: frameId });
		assert(scopes.success);
		assert.equal(scopes.body.scopes.length, 4);
		assert.deepEqual(scopes.body.scopes.map(s=>s.name), [
			"Locals", "Upvalues", "Storage", "Globals",
		]);

		const localsref = scopes.body.scopes.find(s=>s.name==="Locals")!.variablesReference;
		const locals = await dc.variablesRequest({variablesReference: localsref});
		assert(locals.success);
		assert.partialDeepStrictEqual(locals.body.variables[0], {
			name: '<temporaries>',
			value: '<temporaries>',
			presentationHint: { kind: 'virtual' },
		});
		assert.partialDeepStrictEqual(locals.body.variables[1], {
			name: 'foo',
			value: 'true',
			type: 'boolean',
		});

		const setresult = await dc.setVariableRequest({
			variablesReference: localsref,
			name: 'foo',
			value: '42',
		});
		assert(setresult.success);
		assert.equal(setresult.body.type, 'number');
		assert.equal(setresult.body.value, '42');

		await dc.terminateRequest();
	});

	await test('should report scopes and variables in data', { timeout }, async ()=>{
		await launch({
			hookData: true,
		}, "scopes");
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/data.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');
		const threads = await dc.threadsRequest();
		assert.equal(threads.body.threads.length, 1);
		assert.deepEqual(threads.body.threads[0], {id: 1, name: "data"});

		const stack = await dc.stackTraceRequest({threadId: 1, levels: 1});
		assert(stack.success);
		assert.equal(stack.body.stackFrames[0].source?.path, scriptpath);
		const frameId = stack.body.stackFrames[0].id;

		const scopes = await dc.scopesRequest({frameId: frameId });
		assert(scopes.success);
		assert.equal(scopes.body.scopes.length, 3);
		assert.deepEqual(scopes.body.scopes.map(s=>s.name), [
			"Locals", "Upvalues", "Globals",
		]);

		const localsref = scopes.body.scopes.find(s=>s.name==="Locals")!.variablesReference;
		const locals = await dc.variablesRequest({variablesReference: localsref});
		assert(locals.success);
		assert.partialDeepStrictEqual(locals.body.variables[0], {
			name: 'foo',
			value: 'true',
			type: 'boolean',
		});
		assert.partialDeepStrictEqual(locals.body.variables[1], {
			name: 'bar',
			value: 'false',
			type: 'boolean',
		});

		const setresult = await dc.setVariableRequest({
			variablesReference: localsref,
			name: 'foo',
			value: '42',
		});
		assert(setresult.success);
		assert.equal(setresult.body.type, 'number');
		assert.equal(setresult.body.value, '42');

		await dc.terminateRequest();
	});

	await test('should eval', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		});
		assert.equal(bps.success, true );
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
		const threadId = stopped.body.threadId!;
		const stack = await dc.stackTraceRequest({threadId, levels: 1});
		const frameId = stack.body.stackFrames[0].id;

		async function tryeval(evalArgs:DebugProtocol.EvaluateArguments, expectType:string, expectResult:string|RegExp) {
			const evalResult = await dc.evaluateRequest(evalArgs);
			assert.equal(evalResult.body.type, expectType);
			assert.equal(evalResult.body.variablesReference, 0);

			if (expectResult instanceof RegExp) {
				assert.match(evalResult.body.result, expectResult);
			} else {
				assert.equal(evalResult.body.result, expectResult);
			}
		}

		await Promise.all([
			tryeval({
				context: 'repl',
				expression: 'foo',
				frameId: frameId,
			}, 'boolean', /true\n⏱️ [\d\.]+ms/),
			tryeval({
				context: 'repl',
				expression: 'foo',
			}, 'nil', /nil\n⏱️ [\d\.]+ms/),
			tryeval({
				context: 'test',
				expression: '"foo"',
			}, 'string', '"foo"'),
		]);

		await dc.terminateRequest();
	});

	await test('should eval LS translation', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		});
		assert.equal(bps.success, true );
		await dc.configurationDoneRequest();
		await dc.waitForEvent('stopped');

		const result = await dc.evaluateRequest({
			context: 'test',
			expression: '{"","foo","bar"}',
		});
		assert.equal(result.body.type, "table");

		const children = await dc.variablesRequest({
			variablesReference: result.body.variablesReference,
			filter: "named",
		});

		assert.partialDeepStrictEqual(children.body.variables[0], {
			name: "<translated>",
			type: "LocalisedString",
			value: "foobar",
		});

		await dc.terminateRequest();
	});

	await test('should reload ref IDs', { timeout }, async ()=>{
		await launch({
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
			runningTimeout: 30000,
		});
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(import.meta.dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.slice(1);
		}
		const bps = await dc.setBreakpointsRequest({
			source: {
				path: scriptpath,
			},
			breakpoints: [{ line: 3 }],
		});
		assert.equal(bps.success, true );
		await dc.configurationDoneRequest();
		const stopped = (await dc.waitForEvent('stopped')) as DebugProtocol.StoppedEvent;
		assert.equal(typeof stopped.body.threadId, 'number');
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
			const vars = await dc.variablesRequest({
				variablesReference: result.body.variablesReference,
				filter: "indexed",
				start: i * 100,
				count: 100,
			});
			assert(vars.body.variables);
		}

		await dc.terminateRequest();
	});
});