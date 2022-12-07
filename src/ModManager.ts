import * as fsp from 'fs/promises';
import * as path from 'path';
import { default as fetch } from "node-fetch";

import type { ModInfo } from './vscode/ModPackageProvider';
import { version as bundleVersion } from "../package.json";

export const BundledMods:{[name:string]:{version:string; zip():Promise<Uint8Array>}} = {
	["debugadapter"]: {
		version: bundleVersion,
		//@ts-expect-error UInt8Array from esbuild
		zip: async()=>(await import("factoriomod:../mod")).default,
	},
};



export type ModCategory = ""|"general"|"non-game-changing"|"helper-mods"|
	"transportation"|"logistics"|"utility"|"balancing"|"weapons"|"enemies"|
	"armor"|"oil"|"logistic-network"|"circuit-network"|"storage"|
	"power-production"|"manufacture"|"blueprints"|"cheats"|"defense"|"mining"|
	"environment"|"info"|"trains"|"big-mods"|"scenarios"|"mod-packs"|"libraries";

export type ModLicense =
	`default_${"mit"|"gnugplv3"|"gnulgplv3"|"mozilla2"|"apache2"|"unlicense"}` |
	`custom_${string}`;

export interface ModPortalResult<Full extends boolean=false> {
	downloads_count:number
	name:string
	owner:string
	releases:ModPortalRelease<Full>[]
	summary:string
	title:string
	category?:ModCategory
	changelog:Full extends true?string:never
	created_at:Full extends true?string:never
	description:Full extends true?string:never
	github_path:Full extends true?string:never
	homepage:Full extends true?string:never
	tag:Full extends true?ModCategory[]|undefined:never
	images:Full extends true?ModPortalImage[]:never
}

export interface ModPortalImage {
	id:string
	thumbnail:string
	url:string
}

export interface ModPortalRelease<Full extends boolean> {
	download_url:string
	file_name:string
	info_json:Pick<ModInfo, "factorio_version"|(Full extends true?"dependencies":never)>
	released_at:string
	version:string
	sha1:string
}

interface ModEntry {
	name: string
	enabled: boolean
	version?: string
}
interface ModList {
	mods: ModEntry[]
}

type ModInstallOptions =  {
	keepOld?:boolean
}&({
	origin: "bundle"
}|{
	origin: "portal"|"any"
	credentialPrompt():Promise<{username:string; password:string}>
});
interface ModInstallResult {
	using:string
	from:"folder"|"versioned_folder"|"existing"|"installed"
	previous?:boolean|string
	replaced?:string
	}

async function getModInfo(name:string, full:true):Promise<ModPortalResult<true>>;
async function getModInfo(name:string, full?:false):Promise<ModPortalResult<false>>;
async function getModInfo(name:string, full?:boolean):Promise<ModPortalResult<boolean>> {
	const result = await fetch(`https://mods.factorio.com/api/mods/${name}${full?"/full":""}`,);
	if (!result.ok) {
		throw new Error(result.statusText);
	}
	return await result.json();
}
export class ModManager {
	private modList:ModList = { mods: [] };

	public readonly Loaded:Promise<void>;
	constructor(
		private readonly modsPath:string,
		private readonly playerdataPath?:string,
	) {
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

	private async getDownloadCredentials(prompt:()=>Promise<{username:string; password:string}>) {
		const playerdatapath = this.playerdataPath ?? path.resolve(this.modsPath, "../player-data.json");

		const playerdata:{
			["service-username"]: string
			["service-token"]: string
		} = playerdatapath && await fsp.readFile(playerdatapath, "utf8")
			.then(text=>JSON.parse(text))
			.catch(()=>undefined);
		if (playerdata?.["service-token"]) {
			return {
				username: playerdata['service-username'],
				token: playerdata['service-token'],
			};
		}
		const got = await prompt();

		const login_result = await fetch("https://auth.factorio.com/api-login", {
			method: "POST",
			body: new URLSearchParams({
				username: got.username,
				password: got.password,
				api_version: "4",
				require_game_ownership: "true",
			}),
		});
		if (!login_result.ok) { throw new Error(login_result.statusText); }

		const login_json = <{username:string; token:string}>(await login_result.json());

		if (playerdata) {
			playerdata['service-username'] = login_json.username;
			playerdata['service-token'] = login_json.token;
			await fsp.writeFile(playerdatapath!, JSON.stringify(playerdata, undefined, 2));
		}

		return login_json;
	}

	private async findInstallSource(name:string, options:ModInstallOptions) {
		// origin:bundle -> only bundled mods
		// origin:portal -> only portal mods
		// origin:any -> bundled if present, else try portal

		if (options.origin!=="portal") {
			const bundle = BundledMods[name];
			if (bundle) {
				return bundle;
			}
			if (options.origin === "bundle") {
				throw new Error(`No bundled package for ${name}`);
			}
		}

		const modinfo = await getModInfo(name);

		//TODO: proper version sorting/filtering
		const lastrelease = modinfo.releases[modinfo.releases.length-1];
		return {
			version: lastrelease.version,
			zip: async ()=>{
				const cred = await this.getDownloadCredentials(options.credentialPrompt);
				const download = await fetch(`https://mods.factorio.com/${lastrelease.download_url}?username=${cred.username}&token=${cred.token}`);
				if (!download.ok) { throw new Error(download.statusText); }
				return download.body;
			},
		};
	}

	public async installMod(name:string, options:ModInstallOptions):Promise<ModInstallResult> {
		const bundle = await this.findInstallSource(name, options);
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
		if (!options.keepOld) {
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