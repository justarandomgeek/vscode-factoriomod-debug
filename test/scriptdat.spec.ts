import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite } from "node:test";
import assert from 'node:assert/strict';
import { forkTest } from "./util.ts";

await suite('CLI script.dat dump', async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');

	await test('dump 1.1', async ()=>{
		const result = await forkTest(fmtk,
			["scriptdat", path.join(import.meta.dirname, 'test-script_1.1.dat')],
			{cwd: import.meta.dirname});
		const expected = JSON.parse(await fsp.readFile(path.join(import.meta.dirname, 'test-script_1.1.json'), "utf8"));
		assert.deepEqual(JSON.parse(result.stdout.toString("utf8")), expected);
	});

	await test.skip('dump', async ()=>{
		const result = await forkTest(fmtk,
			["scriptdat", path.join(import.meta.dirname, 'test-script.dat')],
			{cwd: import.meta.dirname});
		const expected = JSON.parse(await fsp.readFile(path.join(import.meta.dirname, 'test-script.json'), "utf8"));
		assert.deepEqual(JSON.parse(result.stdout.toString("utf8")), expected);
	});

});