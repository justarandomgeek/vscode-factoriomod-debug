import * as fsp from 'fs/promises';
import { program } from 'commander';

import { URI, Utils } from 'vscode-uri';
import { BufferStream, ModSettings, ModSettingsValue } from '../fmtk';

const settingscommand = program.command("settings")
	.description("Edit mod settings")
	.option("--modsPath <modsPath>", "mods directory to operate on", process.cwd());

settingscommand.command("list")
	.description("List all current saved values")
	.action(async ()=>{
		const modSettingsUri = Utils.joinPath(URI.file(settingscommand.opts().modsPath), "mod-settings.dat");
		const settings = new ModSettings(new BufferStream(await fsp.readFile(modSettingsUri.fsPath)));
		for (const setting of settings.list()) {
			let valuetext = setting.value;
			switch (typeof setting.value) {
				case "string":
					valuetext = `"${setting.value}"`;
					break;
				case "object":
					valuetext = `Color(${setting.value.r}, ${setting.value.g}, ${setting.value.b}, ${setting.value.a})`;
					break;
				default:
					break;
			}

			console.log(`${setting.scope} ${setting.setting} ${valuetext}`);
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
			case 'color':
				console.log(`Color(${setting.value.r}, ${setting.value.g}, ${setting.value.b}, ${setting.value.a})`);
				break;

			default:
				console.error(`Unknown type ${(setting as ModSettingsValue).type}`);
				process.exit(1);
		}
	});

settingscommand.command("set <scope> <name>")
	.option("--type <type>", "Force type (otherwise autodetect)")
	.argument("<value>")
	.description("Set the saved value of a setting")
	.action(async (scope:string, name:string, value:string, options: {
		type:string
	})=>{
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
		if (options.type) {
			switch (options.type) {
				case "bool":
					if (value === "true" || value ==="false") {
						settings.set(scope, name, { type: 'bool', value: value==="true"});
						break;
					} else {
						console.error(`invalid bool value ${value}`);
						process.exit(1);
					}
				case "number":
					const numValue = Number(value);
					if (!isNaN(numValue) && value!=="") {
						settings.set(scope, name, { type: 'number', value: numValue});
						break;
					} else {
						console.error(`invalid number value ${value}`);
						process.exit(1);
					}
				case "color":
					let match = value.match(/(?:color:)?\(([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)/i);
					if (match) {
						settings.set(scope, name, { type: 'color', value: {
							r: Math.max(0, Math.min(1, parseFloat(match[1]))),
							g: Math.max(0, Math.min(1, parseFloat(match[2]))),
							b: Math.max(0, Math.min(1, parseFloat(match[3]))),
							a: match[4] ? Math.max(0, Math.min(1, parseFloat(match[4]))) : 1,
						}});
						break;
					}
					match = value.match(/#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/);
					if (match) {
						settings.set(scope, name, { type: 'color', value: {
							r: parseInt(match[1], 16)/255,
							g: parseInt(match[2], 16)/255,
							b: parseInt(match[3], 16)/255,
							a: match[4] ? parseInt(match[4], 16)/255 : 1,
						}});
						break;
					}
					console.error(`invalid color value ${value}`);
					process.exit(1);
				case "string":
					settings.set(scope, name, { type: 'string', value: value });
					break;

				default:
					console.error(`Unknown type ${options.type}`);
					process.exit(1);
			}
		} else if (value === "true" || value ==="false") {
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