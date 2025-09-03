import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite, before, after } from "node:test";
import assert from 'node:assert/strict';
import { forkTest, forkTestFails } from "./util.ts";

await suite('CLI Mod Settings', async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const mods = path.join(import.meta.dirname, "./factorio/mod-settings-tests");

	before(async ()=>{
		await fsp.mkdir(mods, {recursive: true});
		await fsp.copyFile(path.join(import.meta.dirname, "empty-mod-settings.dat"), path.join(mods, "mod-settings.dat"));
	});

	after(async ()=>{
		await fsp.rm(mods, {recursive: true});
	});

	await test('list empty', async ()=>{
		const result = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		assert.equal(result.stdout, null);
	});

	await test('set bool', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "true"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "true\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "false"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "false\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "true"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "true\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "false"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "false\n");

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "bool", "oops"], {cwd: mods});
	});

	await test('set number', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "42"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(Number(result.stdout.toString()), 42);

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "number", "27.5"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(Number(result.stdout.toString()), 27.5);

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "number", "oops"], {cwd: mods});
	});

	await test('set string', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "asdf"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "\"asdf\"\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "string", "true"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "\"true\"\n");
	});

	await test('set color', async ()=>{
		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "(0.5, 0.25, 0.125)"], {cwd: mods});
		let result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "Color(0.5, 0.25, 0.125, 1)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "(0.5, 0.25, 0.125, 0.5)"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "Color(0.5, 0.25, 0.125, 0.5)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "#ffffff"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "Color(1, 1, 1, 1)\n");

		await forkTest(fmtk, ["settings", "set", "startup", "test", "--type", "color", "80402080"], {cwd: mods});
		result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.match(result.stdout.toString(), /Color\(0\.50\d+, 0\.25\d+, 0\.125\d+, 0.50\d+\)\n/);

		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "color", "oops"], {cwd: mods});
	});

	await test('error on bad type', async ()=>{
		await forkTestFails(fmtk, ["settings", "set", "startup", "test", "--type", "oops", "oops"], {cwd: mods});
	});

	await test('unset', async ()=>{
		await forkTest(fmtk, ["settings", "unset", "startup", "test"], {cwd: mods});
		const result = await forkTest(fmtk, ["settings", "get", "startup", "test"], {cwd: mods});
		assert(result.stdout);
		assert.equal(result.stdout.toString(), "undefined\n");
	});

	await test('list', async ()=>{
		// make sure it's still empty to start with...
		const result1 = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		assert.equal(result1.stdout, null);
		await forkTest(fmtk, ["settings", "set", "startup", "test-1", "123"], {cwd: mods});
		await forkTest(fmtk, ["settings", "set", "runtime-global", "test-2", "true"], {cwd: mods});
		await forkTest(fmtk, ["settings", "set", "runtime-per-user", "test-3", "asdf"], {cwd: mods});
		await forkTest(fmtk, ["settings", "set", "runtime-per-user", "test-4", "--type", "color", "#ffffff"], {cwd: mods});
		const result2 = await forkTest(fmtk, ["settings", "list"], {cwd: mods});
		assert(result2.stdout);
		assert.equal(result2.stdout.toString(), "startup test-1 123\nruntime-global test-2 true\nruntime-per-user test-3 \"asdf\"\nruntime-per-user test-4 Color(1, 1, 1, 1)\n");
	});

	await test('error on bad scopes', async ()=>{
		await forkTestFails(fmtk, ["settings", "get", "badscope", "test"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "set", "badscope", "test", "value"], {cwd: mods});
		await forkTestFails(fmtk, ["settings", "unset", "badscope", "test"], {cwd: mods});
	});

});