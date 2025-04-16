import * as path from "path";
import { test, suite } from "mocha";
import { forkTest } from "./util";

suite('CLI Docs', ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const jsonpath = path.join(import.meta.dirname, "factorio/doc-html/runtime-api.json");
	const protospath = path.join(import.meta.dirname, "factorio/doc-html/prototype-api.json");
	const cwd = path.join(import.meta.dirname, "../");

	test('sumneko-3rd', async ()=>{
		await forkTest(fmtk, ["sumneko-3rd",
			"-d", jsonpath,
			"-p", protospath,
			path.join(import.meta.dirname, "../out/sumneko-3rd")], {cwd: cwd});
	});

});