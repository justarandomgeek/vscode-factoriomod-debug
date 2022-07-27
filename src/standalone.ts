#!/usr/bin/env node
import * as os from "os";
import * as fsp from 'fs/promises';
import type { FileSystem, FileType } from 'vscode';
import { URI, Utils } from 'vscode-uri';
import { program } from 'commander';
import { ModManager } from './ModManager';
import { ApiDocGenerator } from './ApiDocs/ApiDocGenerator';
import { ModSettings } from './ModSettings';
import { FactorioModDebugSession } from './factorioModDebug';
import { ActiveFactorioVersion, FactorioVersion } from "./FactorioVersion";


const fsAccessor:  Pick<FileSystem, "readFile"|"writeFile"|"stat"> = {
	async readFile(uri:URI) {
		return fsp.readFile(uri.fsPath);
	},
	async writeFile(uri:URI, content:Buffer) {
		return fsp.writeFile(uri.fsPath, content);
	},
	async stat(uri:URI) {
		const stat = await fsp.stat(uri.fsPath);

		return {
			size: stat.size,
			// eslint-disable-next-line no-bitwise
			type: (stat.isFile() ? <FileType>1 : 0) |
				(stat.isDirectory() ? <FileType>2 : 0) |
				(stat.isSymbolicLink() ? <FileType>64 : 0),
			ctime: stat.ctime.valueOf(),
			mtime: stat.mtime.valueOf(),
		};
	},
};


const modscommand = program.command("mods")
	.option("--modsPath <modsPath>", undefined, process.cwd());
modscommand.command("enable <modname> [version]").action(async (modname:string, version?:string)=>{
	const manager = new ModManager(modscommand.opts().modsPath);
	manager.set(modname, version??true);
	manager.write();
});
modscommand.command("disable <modname>").action(async (modname:string)=>{
	const manager = new ModManager(modscommand.opts().modsPath);
	manager.set(modname, false);
	manager.write();
});
//modscommand.command("install <modname>").action(async (modname:string)=>{
//TODO: install from internal packages or mod portal
//});

const settingscommand = program.command("settings")
	.option("--modsPath <modsPath>", undefined, process.cwd());
settingscommand.command("list [scope]").action(async ()=>{
	const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
	const settings = new ModSettings(Buffer.from(await fsp.readFile(modSettingsUri.fsPath)));
	for (const setting of settings.list()) {
		console.log(`${setting.scope} ${setting.setting} ${typeof setting.value==="string"?`"${setting.value}"`:setting.value}`);
	}
});
settingscommand.command("get <scope> <name>").action(async (scope:string, name:string)=>{
	switch (scope) {
		case "startup":
		case "runtime-global":
		case "runtime-per-user":
			break;
		default:
			console.log(`Unknown scope "${scope}"`);
			return;
	}
	const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
	const settings = new ModSettings(Buffer.from(await fsp.readFile(modSettingsUri.fsPath)));
	const value = settings.get(scope, name);
	console.log(`${typeof value==="string"?`"${value}"`:value}`);
});
settingscommand.command("set <scope> <name> <value>").action(async (scope:string, name:string, value:string)=>{
	switch (scope) {
		case "startup":
		case "runtime-global":
		case "runtime-per-user":
			break;
		default:
			console.log(`Unknown scope "${scope}"`);
			return;
	}
	const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
	const settings = new ModSettings(Buffer.from(await fsp.readFile(modSettingsUri.fsPath)));
	if (value === "true" || value ==="false") {
		settings.set(scope, name, value==="true");
	} else {
		const numValue = Number(value);
		if (!isNaN(numValue) && value!=="") {
			settings.set(scope, name, numValue);
		} else {
			settings.set(scope, name, value);
		}
	}

	await fsp.writeFile(modSettingsUri.fsPath, settings.save());
});

const docsettings = {};
const settingsGetter = {
	get: function(key:string, defaultValue?:any) {
		return (key in docsettings && docsettings[<keyof typeof docsettings>key]) ?? defaultValue;
	},
};
program.command("docs <docjson> <outdir>").action(async (docjson:string, outdir:string)=>{
	const docs = new ApiDocGenerator((await fsp.readFile(docjson, "utf8")).toString(), settingsGetter);
	const outuri = URI.file(outdir);
	await fsp.mkdir(outdir, { recursive: true });
	await docs.generate_sumneko_docs(async (filename:string, buff:Buffer)=>{
		await fsp.writeFile(Utils.joinPath(outuri, filename).fsPath, buff);
	});
});

const debugcommand = program.command("debug <factorioPath>");
debugcommand.option("-d, --docs <docsPath>")
	.option("-c, --config <configPath>")
	.action(async (factorioPath:string)=>{
		const packageUri = Utils.resolvePath(URI.file(__dirname), "..");
		const fv: FactorioVersion = {
			name: "standalone",
			factorioPath: factorioPath,
			configPath: debugcommand.opts().config,
			docsPath: debugcommand.opts().docs,
		};
		const docsPath = Utils.joinPath(URI.file(factorioPath),
			fv.docsPath ? fv.docsPath :
			(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
			"../../../doc-html/runtime-api.json"
		);
		const docsjson = await fsp.readFile(docsPath.fsPath, "utf8");
		const activeVersion = new ActiveFactorioVersion(fsAccessor, fv, new ApiDocGenerator(docsjson, settingsGetter));

		// start a single session that communicates via stdin/stdout
		const session = new FactorioModDebugSession(packageUri, activeVersion, fsAccessor);
		process.on('SIGTERM', ()=>{
			session.shutdown();
		});
		session.start(process.stdin, process.stdout);
	});

program
	.addHelpCommand()
	.showHelpAfterError()
	.showSuggestionAfterError()
	// when launched by vscode-pretending-to-be-node this detects electron
	// but has node-style args, so force it...
	.parseAsync(process.argv, {from: "node"});