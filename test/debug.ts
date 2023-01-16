import * as inspector from "inspector";
import { setup, teardown, test } from "mocha";
import { DebugClient } from "@vscode/debugadapter-testsupport";
import * as testversion from "./testversion.json";


let dc: DebugClient;

setup( ()=>{
	dc = new DebugClient('node', './dist/fmtk.js', 'factoriomod', {
		env: Object.assign({},
			process.env,
			{
				FMTK_TEST_INSPECT: inspector.url() ? "34198" : undefined,
				FMTK_TEST_ARGV: JSON.stringify([
					"debug", testversion.factorioPath,
					"-d", testversion.docsPath,
				]),
			},
		),
	});
	dc.defaultTimeout=60000;
	return dc.start();
});

teardown( ()=>dc.stop() );

test('should launch', async ()=>{
	return Promise.all([
		dc.configurationSequence(),
		dc.launch({
			"type": "factoriomod",
			"request": "launch",
			"factorioArgs": ["--load-scenario", "base/freeplay"],
		}),
		dc.waitForEvent('terminated'),
	]);
});
