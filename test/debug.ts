import * as inspector from "inspector";
import * as path from "path";
import { setup, teardown, test, suite } from "mocha";
import { DebugClient } from "@vscode/debugadapter-testsupport";
import type { LaunchRequestArguments } from "../src/Debug/factorioModDebug";
import type { OutputEvent } from "@vscode/debugadapter";

suite('Debug Adapter', ()=>{
	let dc: DebugClient;

	setup(async ()=>{
		dc = new DebugClient('node', path.join(__dirname, '../dist/fmtk.js'), 'factoriomod', {
			cwd: path.join(__dirname, "./factorio/mods"),
			env: Object.assign({},
				process.env,
				{
					FMTK_TEST_INSPECT: inspector.url() ? "34198" : undefined,
					FMTK_TEST_ARGV: JSON.stringify([
						"debug",
						path.join(__dirname, "./factorio/bin/x64/factorio.exe"),
					]),
				},
			),
			// for some reason not being detached makes factorio's stdin break (when it reopens it?)
			detached: true,
		});
		dc.on('output', (e:OutputEvent)=>{
			console.log(`${e.body.category} ${e.body.output}`);
		});
		await dc.start();
		// long timeouts because we're loading factorio...
		dc.defaultTimeout = 30000;
		// or fake "socket" to disable timeouts
		//(dc as any)._socket = { end: ()=>{} };
	});

	teardown(async ()=>{
		await dc.stop();
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
});