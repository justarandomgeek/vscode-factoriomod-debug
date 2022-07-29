import * as fs from 'fs';
import * as path from 'path';
import { ModInfo } from './ModPackageProvider';

import { version as bundleVersion } from "../package.json";

//@ts-ignore UInt8Array from esbuild
import DebugAdapterZip from "factoriomod:../mod";

const bundled:{[name:string]:{version:string; zip:Uint8Array}} = {
	["debugadapter"]: {
		version: bundleVersion,
		zip: DebugAdapterZip,
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

	constructor(private readonly modsPath:string) {
		this.reload();
	}

	public reload() {
		const listPath = path.resolve(this.modsPath, "./mod-list.json");
		if (fs.existsSync(listPath)) {
			this.modList = JSON.parse(fs.readFileSync(listPath, 'utf8'));
		} else {
			this.modList = { mods: [] };
		}
	}

	public write() {
		const listPath = path.resolve(this.modsPath, "./mod-list.json");
		fs.writeFileSync(listPath, JSON.stringify(this.modList, null, 2), 'utf8');
	}

	public installMod(name:string, origin:"bundle"[]=["bundle"], keepOld?:boolean):{
		using:string
		from:"folder"|"versioned_folder"|"existing"|"installed"
		previous?:boolean|string
		replaced?:string
		} {

		//TODO: support installing from portal too
		const bundle = name in bundled ? bundled[<keyof typeof bundled>name] : undefined;
		if (!bundle) { throw new Error(`No bundled package for ${name}`); }
		const version = bundle.version;

		const modstate = this.modList.mods.find(m=>m.name === name);
		const previous = modstate?.enabled ? modstate.version ?? true : modstate?.enabled;

		function checkDir(dirpath:string) {
			const dirinfopath = path.resolve(dirpath, "info.json");
			if (fs.existsSync(dirinfopath)) {
				const jsonstr = fs.readFileSync(dirinfopath, "utf8");
				if (jsonstr) {
					const dirinfo:ModInfo = JSON.parse(jsonstr);
					if (dirinfo.name === name && dirinfo.version === version) {
						return true;
					}
				}
			}
			return false;
		}

		// check for dir `modname` with correct info.json inside
		if (checkDir(path.resolve(this.modsPath, name))) {
			this.set(name, version);
			return { using: version, from: "folder", previous: previous };
		}
		// check for dir `modname_version` with correct info.json inside
		if (checkDir(path.resolve(this.modsPath, `${name}_${version}`))) {
			this.set(name, version);
			return { using: version, from: "versioned_folder", previous: previous };
		}
		// check for `modname_version.zip`
		if (fs.existsSync(path.resolve(this.modsPath, `${name}_${version}.zip`))) {
			this.set(name, version);
			return { using: version, from: "existing", previous: previous };
		}
		// install from provided zip
		fs.writeFileSync(path.resolve(this.modsPath, `${name}_${version}.zip`), bundle.zip);
		let replaced:string|undefined;
		if (!keepOld) {
			const oldmods = fs.readdirSync(this.modsPath, "utf8").filter(
				s=>s.startsWith(name) && s.endsWith(".zip") && s !== `${name}_${version}.zip`);
			if (oldmods.length === 1) {
				fs.unlinkSync(path.resolve(this.modsPath, oldmods[0]));
				replaced = oldmods[0].substring(name.length+1, oldmods[0].length-4);
			}
		}
		this.set(name, version);
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