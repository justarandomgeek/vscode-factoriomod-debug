import { DebugClient } from "@vscode/debugadapter-testsupport";


let dc: DebugClient;

setup( ()=>{
	dc = new DebugClient('node', '../dist/fmtk.js', 'factoriomod', {

	});
	return dc.start();
});

teardown( ()=>dc.stop() );