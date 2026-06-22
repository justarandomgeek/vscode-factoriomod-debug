import * as path from "path";
import * as fsp from "fs/promises";
import { test, suite, before, after } from "node:test";
import assert from 'node:assert/strict';
import { forkTest } from "./util.ts";
import type { ModInstallResult } from "../src/ModManager";

await suite('CLI Mod Manager', { concurrency: false }, async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const mods = path.join(import.meta.dirname, "./factorio/mod-manager-tests");

	before(async ()=>{
		await fsp.mkdir(mods, {recursive: true});
	});

	after(async ()=>{
		await fsp.rm(mods, {recursive: true});
	});

	await test('install jargtestmod from portal', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "--force", "jargtestmod"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		assert.equal(jsonresult.from, "installed");
	});

	await test('enable jargtestmod', async ()=>{
		await forkTest(fmtk, ["mods", "enable", "jargtestmod"], {cwd: mods});
	});

	await test('disable jargtestmod', async ()=>{
		await forkTest(fmtk, ["mods", "disable", "jargtestmod"], {cwd: mods});
	});

	await test('adjust', async ()=>{
		await forkTest(fmtk, ["mods", "adjust",
			"testa=true", "testb=false", "testversion=1.0.0",
			"testinvalid=foo", "--disableExtra",
		], {cwd: mods});
	});
});