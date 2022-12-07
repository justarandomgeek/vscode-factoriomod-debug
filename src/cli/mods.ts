import { program } from 'commander';
import inquirer from "inquirer";
import { ModManager, BundledMods } from '../ModManager';

const modscommand = program.command("mods")
	.description("Mod management commands")
	.option("--modsPath <modsPath>", "mods directory to operate on", process.cwd());
modscommand.command("enable <modname> [version]")
	.description("Enable a mod or select a specific version of it")
	.action(async (modname:string, version?:string)=>{
		const manager = new ModManager(modscommand.opts().modsPath);
		await manager.Loaded;
		manager.set(modname, version??true);
		await manager.write();
	});
modscommand.command("disable <modname>")
	.description("Disable a mod")
	.action(async (modname:string)=>{
		const manager = new ModManager(modscommand.opts().modsPath);
		await manager.Loaded;
		manager.set(modname, false);
		await manager.write();
	});
modscommand.command("install <modname>")
	.description(`Install a mod. Currently only supports bundled mods: ${Object.keys(BundledMods)}`)
	.option("--keepOld", "Don't remove old versions if present")
	.action(async (modname:string, options:{keepOld?:boolean})=>{
		const manager = new ModManager(modscommand.opts().modsPath);
		await manager.Loaded;
		console.log(await manager.installMod(modname, {
			origin: "any",
			credentialPrompt: async ()=>inquirer.prompt<{username:string;password:string}>([{
				message: "Username:",
				name: "username",
				type: "input",
			}, {
				message: "Password:",
				name: "password",
				type: "password",
			}])}));
	});
modscommand.command("adjust <changes...>")
	.description("Configure multiple mods at once: modname=true|false|x.y.z")
	.option("--allowDisableBase", "Allow disabling the base mod")
	.option("--disableExtra", "Disable any mods not named in the changeset")
	.action(async (changes:string[], options:{allowDisableBase?:boolean; disableExtra?:boolean})=>{
		const manager = new ModManager(modscommand.opts().modsPath);
		await manager.Loaded;
		if (options.disableExtra) {
			console.log(`All Mods disabled`);
			manager.disableAll();
		}
		for (const change of changes) {
			const match = change.match(/^(.*)=(true|false|(?:\d+\.){2}\d+)$/);
			if (!match) {
				console.log(`Doing nothing with invalid adjust arg "${change}"`);
			} else {
				const mod = match[1];
				const adjust =
				match[2] ==="true" ? true :
				match[2] ==="false" ? false :
				match[2];
				manager.set(mod, adjust);
				console.log(`${mod} ${
					adjust === true ? "enabled" :
					adjust === false ? "disabled" :
					"enabled version " + adjust
				}`);
			}
		}

		if (!options.allowDisableBase) { manager.set("base", true); }
		try {
			await manager.write();
		} catch (error) {
			console.log(`Failed to save mod list:\n${error}`);
		}
	});