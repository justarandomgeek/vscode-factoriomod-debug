import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite } from "mocha";
import { expect } from "chai";
import { forkTest } from "./util";

suite('CLI script.dat dump', ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk-cli.js');

	test('dump', async ()=>{
		const result = await forkTest(fmtk,
			["scriptdat", path.join(__dirname, 'test-script.dat')],
			{cwd: __dirname});
		const expected = JSON.parse(await fsp.readFile(path.join(__dirname, 'test-script.json'), "utf8"));
		expect(JSON.parse(result.stdout.toString("utf8")))
			.deep.equals(expected);
	});

});