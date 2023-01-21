import * as path from "path";
import { test, suite } from "mocha";
import { forkTest } from "./util";

suite('CLI Docs', ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk.js');
	const jsonpath = path.join(__dirname, "factorio/doc-html/runtime-api.json");
	const cwd = path.join(__dirname, "../");

	test('docs', async ()=>{
		await forkTest(fmtk, ["docs", jsonpath, path.join(__dirname, "../out/docs")], {cwd: cwd});
	});

	test('sumneko-3rd', async ()=>{
		await forkTest(fmtk, ["sumneko-3rd", "-d", jsonpath, path.join(__dirname, "../out/sumneko-3rd")], {cwd: cwd});
	});

});