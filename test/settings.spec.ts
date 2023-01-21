import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite, suiteSetup, suiteTeardown } from "mocha";
import { expect } from "chai";
import { forkTest, forkTestFails } from "./util";

suite.only('CLI Mod Settings', ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk.js');
	const mods = path.join(__dirname, "./factorio/mod-tests");

	suiteSetup(async ()=>{
		await fsp.mkdir(mods, {recursive: true});
		await fsp.copyFile(path.join(__dirname, "empty-mod-settings.dat"), path.join(mods, "mod-settings.dat"));
	});

	suiteTeardown(async ()=>{
		await fsp.rm(mods, {recursive: true});
	});

	test('list empty', async ()=>{
		const result = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		expect(result.stdout).equals(null);
	});

	test('set bool', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "true"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("true\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "false"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("false\n");
	});

	test('set number', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "42"], {cwd: mods});
		const result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(Number(result.stdout.toString())).equals(42);
	});

	test('set string', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "asdf"], {cwd: mods});
		const result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("\"asdf\"\n");
	});

	test('unset', async ()=>{
		await forkTest(fmtk, ["settings", "unset", "startup", "test"], {cwd: mods});
		const result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("undefined\n");
	});

	test('list', async ()=>{
		// make sure it's still empty to start with...
		const result1 = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		expect(result1.stdout).equals(null);
		await forkTest(fmtk, ["settings", "set", "startup", "test-1", "123"], {cwd: mods});
		await forkTest(fmtk, ["settings", "set", "runtime-global", "test-2", "true"], {cwd: mods});
		await forkTest(fmtk, ["settings", "set", "runtime-per-user", "test-3", "asdf"], {cwd: mods});
		const result2 = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		expect(result2.stdout);
		expect(result2.stdout.toString()).equals("startup test-1 123\nruntime-global test-2 true\nruntime-per-user test-3 \"asdf\"\n");
	});

	test('error on bad scopes', async ()=>{
		await forkTestFails(fmtk, ["settings", "get", "badscope", "test"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "set", "badscope", "test", "value"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "unset", "badscope", "test"], {cwd: mods});
	});



});