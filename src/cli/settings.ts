import * as fsp from 'fs/promises';
import { program } from 'commander';

import { URI, Utils } from 'vscode-uri';
import { ModSettings, ModSettingsValue } from '../ModSettings/ModSettings';
import { BufferStream } from '../Util/BufferStream';

const settingscommand = program.command("settings")
	.description("Edit mod settings")
	.option("--modsPath <modsPath>", "mods directory to operate on", process.cwd());

settingscommand.command("list")
	.description("List all current saved values")
	.action(async ()=>{
		const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
		const settings = new ModSettings(new BufferStream(await fsp.readFile(modSettingsUri.fsPath)));
		for (const setting of settings.list()) {
			console.log(`${setting.scope} ${setting.setting} ${typeof setting.value==="string"?`"${setting.value}"`:setting.value}`);
		}
	});

settingscommand.command("get <scope> <name>")
	.description("Get the saved value of a setting")
	.action(async (scope:string, name:string)=>{
		switch (scope) {
			case "startup":
			case "runtime-global":
			case "runtime-per-user":
				break;
			default:
				console.error(`Unknown scope "${scope}"`);
				process.exit(1);
		}
		const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
		const settings = new ModSettings(new BufferStream(await fsp.readFile(modSettingsUri.fsPath)));
		const setting = settings.get(scope, name);
		if (!setting) {
			console.log(`undefined`);
			return;
		}
		switch (setting.type) {
			case 'bool':
			case 'number':
				console.log(`${setting.value}`);
				break;
			case 'int':
				console.log(`${setting.value}n`);
				break;
			case 'string':
				console.log(`"${setting.value}"`);
				break;

			default:
				console.error(`Unkown Type ${(setting as ModSettingsValue).type}`);
				process.exit(1);
		}
	});

settingscommand.command("set <scope> <name> <value>")
	.description("Set the saved value of a setting")
	.action(async (scope:string, name:string, value:string)=>{
		switch (scope) {
			case "startup":
			case "runtime-global":
			case "runtime-per-user":
				break;
			default:
				console.error(`Unknown scope "${scope}"`);
				process.exit(1);
		}
		const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
		const settings = new ModSettings(new BufferStream(await fsp.readFile(modSettingsUri.fsPath)));
		if (value === "true" || value ==="false") {
			settings.set(scope, name, { type: 'bool', value: value==="true"});
		} else {
			const numValue = Number(value);
			if (!isNaN(numValue) && value!=="") {
				settings.set(scope, name, { type: 'number', value: numValue});
			} else {
				settings.set(scope, name, { type: 'string', value: value });
			}
		}
		await fsp.writeFile(modSettingsUri.fsPath, settings.save());
	});

settingscommand.command("unset <scope> <name>")
	.description("Remove the saved value of a setting")
	.action(async (scope:string, name:string)=>{
		switch (scope) {
			case "startup":
			case "runtime-global":
			case "runtime-per-user":
				break;
			default:
				console.error(`Unknown scope "${scope}"`);
				process.exit(1);
		}
		const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
		const settings = new ModSettings(new BufferStream(await fsp.readFile(modSettingsUri.fsPath)));
		settings.set(scope, name);
		await fsp.writeFile(modSettingsUri.fsPath, settings.save());
	});