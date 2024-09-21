import * as path from "path";
import * as fsp from "fs/promises";
import { setup, teardown, test, suite, suiteSetup, suiteTeardown } from "mocha";
import { expect } from "chai";
import { forkTest } from "./util";
import type { ModInstallResult } from "../src/ModManager";
import { version } from "../package.json";

suite('CLI Mod Manager', ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk-cli.js');
	const mods = path.join(__dirname, "./factorio/mod-tests");

	suiteSetup(async ()=>{
		await fsp.mkdir(mods, {recursive: true});
	});

	suiteTeardown(async ()=>{
		await fsp.rm(mods, {recursive: true});
	});

	setup(async ()=>{
	});

	teardown(async ()=>{
	});

	test('install debugadapter from bundle', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "--force", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("installed");
	});

	test('match debugadapter from existing zip', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("existing");
	});

	test('match debugadapter from existing folder', async ()=>{
		await fsp.mkdir(path.join(mods, "debugadapter"));
		await fsp.writeFile(path.join(mods, "debugadapter", "info.json"),
			JSON.stringify({
				name: "debugadapter",
				version: version,
			}));
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("folder");
		await fsp.rm(path.join(mods, "debugadapter"), {recursive: true});
	});

	test('match debugadapter from existing versioned folder', async ()=>{
		const name = `debugadapter_${version}`;
		await fsp.mkdir(path.join(mods, name));
		await fsp.writeFile(path.join(mods, name, "info.json"),
			JSON.stringify({
				name: "debugadapter",
				version: version,
			}));
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("versioned_folder");
		await fsp.rm(path.join(mods, name), {recursive: true});
	});

	test('update debugadapter-tests from bundle', async ()=>{
		await fsp.writeFile(path.join(mods, "debugadapter-tests_0.0.0.zip"), "");
		const result = await forkTest(fmtk, ["mods", "install", "debugadapter-tests"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("installed");
		expect(jsonresult.replaced).equals("0.0.0");
	});

	test('install jargtestmod from portal', async ()=>{
		const result = await forkTest(fmtk, ["mods", "install", "--force", "jargtestmod"], {cwd: mods});
		const jsonresult = JSON.parse(result.stdout.toString("utf8")) as ModInstallResult;
		expect(jsonresult.from).equals("installed");
	});

	test('enable debugadapter', async ()=>{
		await forkTest(fmtk, ["mods", "enable", "debugadapter"], {cwd: mods});
	});

	test('disable debugadapter', async ()=>{
		await forkTest(fmtk, ["mods", "disable", "debugadapter"], {cwd: mods});
	});

	test('adjust', async ()=>{
		await forkTest(fmtk, ["mods", "adjust",
			"testa=true", "testb=false", "testversion=1.0.0",
			"testinvalid=foo", "--disableExtra",
		], {cwd: mods});
	});
});