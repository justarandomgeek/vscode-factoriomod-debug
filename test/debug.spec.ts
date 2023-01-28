import * as path from "path";
import { setup, teardown, test, suite } from "mocha";
import { DebugClient } from "@vscode/debugadapter-testsupport";
import type { LaunchRequestArguments } from "../src/Debug/factorioModDebug";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
//import type { OutputEvent } from "@vscode/debugadapter";
chai.use(chaiAsPromised);

suite('Debug Adapter', ()=>{
	let dc: DebugClient;

	setup(async ()=>{
		dc = new DebugClient('node', path.join(__dirname, '../dist/fmtk.js'), 'factoriomod', {
			cwd: path.join(__dirname, "./factorio/mods"),
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
		await dc.launch({
			type: "factoriomod",
			request: "launch",
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate"],
			//TODO: have a test before this one ensure these are installed?
			// free chance for bundle+portal installs, but portal needs download token
			adjustMods: {
				"debugadapter-tests": true,
				"minimal-no-base-mod": true,
			},
			disableExtraMods: true,
			allowDisableBaseMod: true,
			//trace: true,
		} as LaunchRequestArguments);
		await dc.configurationSequence();
		await dc.waitForEvent('terminated');
	});

	test("should reject launch args", async ()=>{
		expect(dc.launch({
			type: "factoriomod",
			request: "launch",
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--config"],
			adjustMods: {
				"debugadapter-tests": true,
				"minimal-no-base-mod": true,
			},
			disableExtraMods: true,
			allowDisableBaseMod: true,
		} as LaunchRequestArguments)).eventually.throws();

		expect(dc.launch({
			type: "factoriomod",
			request: "launch",
			factorioArgs: ["--load-scenario", "debugadapter-tests/terminate", "--mod-directory"],
			adjustMods: {
				"debugadapter-tests": true,
				"minimal-no-base-mod": true,
			},
			disableExtraMods: true,
			allowDisableBaseMod: true,
		} as LaunchRequestArguments)).eventually.throws();
	});

	test('should stop at breakpoint and step', async ()=>{
		await dc.launch({
			type: "factoriomod",
			request: "launch",
			factorioArgs: ["--load-scenario", "debugadapter-tests/run"],
			adjustMods: {
				"debugadapter-tests": true,
				"minimal-no-base-mod": true,
			},
			disableExtraMods: true,
			allowDisableBaseMod: true,
			//trace: true,
		} as LaunchRequestArguments);
		await dc.waitForEvent('initialized');
		let scriptpath = path.join(__dirname, "./factorio/mods/debugadapter-tests/scenarios/run/control.lua");
		if (process.platform === 'win32') {
			scriptpath = scriptpath[0].toLowerCase() + scriptpath.substr(1);
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
		const stack1 = await dc.stackTraceRequest({threadId: 1});
		expect(stack1.success);
		expect(stack1.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack1.body.stackFrames[0].line).equals(2);
		await dc.stepInRequest({threadId: 1});
		await dc.waitForEvent('stopped');
		const stack2 = await dc.stackTraceRequest({threadId: 1});
		expect(stack2.success);
		expect(stack2.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack2.body.stackFrames[0].line).equals(3);
		await dc.continueRequest({threadId: 1});
		await dc.waitForEvent('stopped');
		const stack3 = await dc.stackTraceRequest({threadId: 1});
		expect(stack3.success);
		expect(stack3.body.stackFrames[0].source?.path).equals(scriptpath);
		expect(stack3.body.stackFrames[0].line).equals(2);
		await dc.terminateRequest();
	});
});