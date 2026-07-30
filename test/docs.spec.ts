import * as path from "path";
import { test, suite } from "node:test";
import { forkTest } from "./util.ts";

await suite('CLI Docs', async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const jsonpath = path.join(import.meta.dirname, "factorio/doc-html/runtime-api.json");
	const protospath = path.join(import.meta.dirname, "factorio/doc-html/prototype-api.json");
	const cwd = path.join(import.meta.dirname, "../");

	await test.skip('sumneko-3rd', async ()=>{
		await forkTest(fmtk, ["sumneko-3rd",
			"-d", jsonpath,
			"-p", protospath,
			path.join(import.meta.dirname, "../out/sumneko-3rd")], {cwd: cwd});
	});

});