import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite, suiteSetup, suiteTeardown } from "mocha";
import { expect } from "chai";
import { forkTest, forkTestFails } from "./util";

suite('CLI Mod Settings', ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk-cli.js');
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

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "true"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("true\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "false"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("false\n");

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "oops"], {cwd: mods});
	});

	test('set number', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "42"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(Number(result.stdout.toString())).equals(42);

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "number", "27.5"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(Number(result.stdout.toString())).equals(27.5);

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "number", "oops"], {cwd: mods});
	});

	test('set string', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "asdf"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("\"asdf\"\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "string", "true"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("\"true\"\n");
	});

	test('set color', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "(0.5, 0.25, 0.125)"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("Color(0.5, 0.25, 0.125, 1)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "(0.5, 0.25, 0.125, 0.5)"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("Color(0.5, 0.25, 0.125, 0.5)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "#ffffff"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).equals("Color(1, 1, 1, 1)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "80402080"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		expect(result.stdout);
		expect(result.stdout.toString()).matches(/Color\(0\.50\d+, 0\.25\d+, 0\.125\d+, 0.50\d+\)\n/);

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "color", "oops"], {cwd: mods});
	});

	test('error on bad type', async ()=>{
		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "oops", "oops"], {cwd: mods});
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
		await forkTest(fmtk, ["settings", "set", "runtime-per-user", "test-4", "--type", "color", "#ffffff"], {cwd: mods});
		const result2 = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		expect(result2.stdout);
		expect(result2.stdout.toString()).equals("startup test-1 123\nruntime-global test-2 true\nruntime-per-user test-3 \"asdf\"\nruntime-per-user test-4 Color(1, 1, 1, 1)\n");
	});

	test('error on bad scopes', async ()=>{
		await forkTestFails(fmtk, ["settings", "get", "badscope", "test"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "set", "badscope", "test", "value"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "unset", "badscope", "test"], {cwd: mods});
	});

});