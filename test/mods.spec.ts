import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite, before, after } from "node:test";
import assert from 'node:assert/strict';
import { forkTest } from "./util.ts";
import type { ModInstallResult } from "../src/ModManager";
import {default as packagejson} from "../package.json" assert { type: "json" };

await suite('CLI Mod Manager', async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const mods = path.join(import.meta.dirname, "./factorio/mod-manager-tests");

	before(async ()=>{
		await fsp.mkdir(mods, {recursive: true});
	});

	after(async ()=>{
		await fsp.rm(mods, {recursive: true});
	});

	await test('install debugadapter from bundle', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "--force", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "installed");
	});

	await test('match debugadapter from existing zip', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "existing");
	});

	await test('match debugadapter from existing folder', async ()=>{
		await fsp.mkdir(path.join(mods, "debugadapter"));
		await fsp.writeFile(path.join(mods, "debugadapter", "info.json"),
			JSON.stringify({
				name: "debugadapter",
				version: packagejson.version,
			}));
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "folder");
		await fsp.rm(path.join(mods, "debugadapter"), {recursive: true});
	});

	await test('match debugadapter from existing versioned folder', async ()=>{
		const name = `debugadapter_${packagejson.version}`;
		await fsp.mkdir(path.join(mods, name));
		await fsp.writeFile(path.join(mods, name, "info.json"),
			JSON.stringify({
				name: "debugadapter",
				version: packagejson.version,
			}));
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "versioned_folder");
		await fsp.rm(path.join(mods, name), {recursive: true});
	});

	await test('update debugadapter-tests from bundle', async ()=>{
		await fsp.writeFile(path.join(mods, "debugadapter-tests_0.0.0.zip"), "");
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter-tests"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "installed");
		assert.equal(jsonresult.replaced, "0.0.0");
	});

	await test('install jargtestmod from portal', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "--force", "jargtestmod"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "installed");
	});

	await test('enable debugadapter', async ()=>{
		await forkTest(fmtk, ["mods", "enable", "debugadapter"], {cwd: mods});
	});

	await test('disable debugadapter', async ()=>{
		await forkTest(fmtk, ["mods", "disable", "debugadapter"], {cwd: mods});
	});

	await test('adjust', async ()=>{
		await forkTest(fmtk, ["mods", "adjust",
			"testa=true", "testb=false", "testversion=1.0.0",
			"testinvalid=foo", "--disableExtra",
		], {cwd: mods});
	});
});