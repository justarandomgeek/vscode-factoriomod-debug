import * as fsp from 'fs/promises';
import * as path from 'path';
import type { ModInfo } from './vscode/ModPackageProvider';

import { version as bundleVersion } from "../package.json";

export const BundledMods:{[name:string]:{version:string; zip():Promise<Uint8Array>}} = {
	["debugadapter"]: {
		version: bundleVersion,
		//@ts-expect-error UInt8Array from esbuild
		zip: async()=>import("factoriomod:../mod"),
	},
};

interface ModEntry{
	name: string
	enabled: boolean
	version?: string
}
interface ModList{
	mods: ModEntry[]
}

export class ModManager {
	private modList:ModList = { mods: [] };

	public readonly Loaded:Promise<void>;
	constructor(private readonly modsPath:string) {
		this.Loaded = this.reload();
	}

	public async reload() {
		const listPath = path.resolve(this.modsPath, "./mod-list.json");
		try {
			this.modList = JSON.parse(await fsp.readFile(listPath, 'utf8'));
		} catch (error) {
			this.modList = { mods: [] };
		}
	}

	public async write() {
		const listPath = path.resolve(this.modsPath, "./mod-list.json");
		return fsp.writeFile(listPath, JSON.stringify(this.modList, null, 2), 'utf8');
	}

	public async installMod(name:string, origin:"bundle"[]=["bundle"], keepOld?:boolean):Promise<{
		using:string
		from:"folder"|"versioned_folder"|"existing"|"installed"
		previous?:boolean|string
		replaced?:string
		}> {

		//TODO: support installing from portal too
		const bundle = BundledMods[name];
		if (!bundle) { throw new Error(`No bundled package for ${name}`); }
		const version = bundle.version;

		const modstate = this.modList.mods.find(m=>m.name === name);
		const previous = modstate?.enabled ? modstate.version ?? true : modstate?.enabled;

		async function checkDir(dirpath:string) {
			const dirinfopath = path.resolve(dirpath, "info.json");
			try {
				const jsonstr = await fsp.readFile(dirinfopath, "utf8");
				if (jsonstr) {
					const dirinfo:ModInfo = JSON.parse(jsonstr);
					if (dirinfo.name === name && dirinfo.version === version) {
						return true;
					}
				}
			} catch (error) {}
			return false;
		}

		// check for dir `modname` with correct info.json inside
		if (await checkDir(path.resolve(this.modsPath, name))) {
			this.set(name, version);
			return { using: version, from: "folder", previous: previous };
		}
		// check for dir `modname_version` with correct info.json inside
		if (await checkDir(path.resolve(this.modsPath, `${name}_${version}`))) {
			this.set(name, version);
			return { using: version, from: "versioned_folder", previous: previous };
		}
		// check for `modname_version.zip`
		try {
			await fsp.access(path.resolve(this.modsPath, `${name}_${version}.zip`));
			this.set(name, version);
			return { using: version, from: "existing", previous: previous };
		} catch (error) {}

		// install from provided zip
		const written = fsp.writeFile(path.resolve(this.modsPath, `${name}_${version}.zip`), await bundle.zip());
		let replaced:string|undefined;
		if (!keepOld) {
			const oldmods = (await fsp.readdir(this.modsPath, "utf8")).filter(
				s=>s.startsWith(name) && s.endsWith(".zip") && s !== `${name}_${version}.zip`);
			if (oldmods.length === 1) {
				await fsp.unlink(path.resolve(this.modsPath, oldmods[0]));
				replaced = oldmods[0].substring(name.length+1, oldmods[0].length-4);
			}
		}
		this.set(name, version);
		await written;
		return { using: version, from: "installed", previous: previous, replaced: replaced };
	}


	public set(name:string, state:boolean|string) {
		const enabled = !!state;
		const version = typeof state === 'string' ? state : undefined;
		const mod = this.modList.mods.find(m=>m.name===name);
		if (mod) {
			mod.enabled = enabled;
			mod.version = version;
		} else {
			this.modList.mods.push({ name: name, enabled: enabled, version: version });
		}
	}

	public enableAll() {
		this.modList.mods.forEach(m=>m.enabled=true);
	}

	public disableAll() {
		this.modList.mods.forEach(m=>m.enabled=false);
	}
}