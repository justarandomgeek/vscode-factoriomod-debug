import type * as vscode from 'vscode';
import * as ini from 'ini';
import * as os from 'os';
import * as path from 'path';
import { URI, Utils } from "vscode-uri";
import { ApiDocGenerator } from './ApiDocs/ApiDocGenerator';

export interface FactorioVersion {
	name: string
	active?: true

	factorioPath: string
	configPath?: string
	docsPath?: string

	nativeDebugger?: string
}


interface FactorioConfigIni {
	path?:{
		"read-data"?:string
		"write-data"?:string
	}
	other?:{
		"cache-prototype-data"?:boolean
	}
};


export function substitutePathVariables(aPath:string, workspaceFolders?:readonly {readonly uri:URI}[]) {
	if (aPath.match(/^~[\\\/]/)) {
		aPath = path.posix.join(
			os.homedir().replace(/\\/g, "/"),
			aPath.replace(/^~[\\\/]/, "") );
	}

	aPath = aPath.replace("${userHome}", os.homedir());

	if (workspaceFolders?.[0]) {
		aPath = aPath.replace("${workspaceFolder}", workspaceFolders[0].uri.fsPath);
	}

	aPath = aPath.replace(/\$\{env:(\w+)}/g, (match, p1)=>process.env[p1] ?? match);

	return aPath;
}

export class ActiveFactorioVersion {
	constructor(
		private readonly fs: Pick<vscode.FileSystem, "readFile"|"writeFile"|"stat">,
		private readonly fv:FactorioVersion,
		public readonly docs:ApiDocGenerator,
		private readonly workspaceFolders?: readonly {readonly uri:URI}[],
	) {
	}

	public async debugLaunchArgs() {
		const args = [];
		args.push(this.factorioPath);
		if (this.fv.docsPath) {
			args.push("--doc", this.fv.docsPath);
		}
		if (this.configPathIsOverriden()) {
			args.push("--config", await this.configPath());
		}
		return args;
	}

	public get name() {
		return this.fv.name;
	}

	public get factorioPath() {
		return substitutePathVariables(this.fv.factorioPath, this.workspaceFolders);
	}

	public configPathIsOverriden() {
		return !!this.fv.configPath;
	}
	public async configPath() {
		if (this.fv.configPath) {
			return substitutePathVariables(this.fv.configPath, this.workspaceFolders);
		}

		// find config-path.cfg then config.ini and dataPath/modsPath defaults
		const cfgpath = path.resolve(path.dirname(this.factorioPath), "../../config-path.cfg" );
		try {
			const configdata = ini.parse((await this.fs.readFile(URI.file(cfgpath))).toString());
			return path.resolve(
				this.translatePath(configdata["config-path"]),
				"./config.ini");
		} catch (error) {
		}
		// try for a config.ini in systemwritepath
		return this.translatePath("__PATH__system-write-data__/config/config.ini");
	}

	public get nativeDebugger() {
		return this.fv.nativeDebugger && substitutePathVariables(this.fv.nativeDebugger, this.workspaceFolders);
	}


	private iniData? : FactorioConfigIni|Thenable<FactorioConfigIni>;
	private async configIni() {
		if (!this.iniData) {
			this.iniData =
				this.fs.readFile(URI.file(await this.configPath()))
					.then(dat=>ini.parse(dat.toString()));
		}
		return this.iniData;
	}

	public async isPrototypeCacheEnabled() {
		let configIni = await this.configIni();
		return configIni.other?.["cache-prototype-data"];
	}

	public async disablePrototypeCache() {
		this.iniData = undefined;
		const configUri = URI.file(await this.configPath());
		let filedata = (await this.fs.readFile(configUri)).toString();
		filedata = filedata.replace("cache-prototype-data=", "; cache-prototype-data=");
		await this.fs.writeFile(configUri, Buffer.from(filedata));
		this.iniData = ini.parse(filedata);
	}

	public async checkSteamAppID(prompt:Pick<typeof vscode.window, "showInformationMessage"|"showErrorMessage">) {
		const factorioPath = URI.file(this.factorioPath);
		const stats = await Promise.allSettled(
			[ "../steam_api64.dll", "../libsteam_api.dylib", "../libsteam_api.so"]
				.map(s=>this.fs.stat(Utils.joinPath(factorioPath, s)))
		);
		if (stats.find(psr=>psr.status==="fulfilled")) {
			const appidUri = Utils.joinPath(factorioPath, "../steam_appid.txt");
			const appidStat = await Promise.allSettled([this.fs.stat(appidUri)]);
			if (!appidStat.find(psr=>psr.status==="fulfilled")) {
				if ("Yes" === await prompt.showInformationMessage("This is a steam install, and will require `steam_appid.txt` in order to be used for debugging. Create it now?", "Yes", "No")) {
					try {
						this.fs.writeFile(appidUri, Buffer.from("427520"));
					} catch (error) {
						prompt.showErrorMessage(`failed to write "427520" to ${appidUri}: ${error}`);
					}
				}
			}
		}
	}

	public async defaultModsPath() {
		const configModsPath = (await this.configIni())?.path?.["write-data"];
		if (!configModsPath) {
			throw "path.write-data missing in config.ini";
		}
		return path.posix.normalize(path.resolve(this.translatePath(configModsPath), "mods"));
	}

	public async dataPath() {
		const configDataPath = (await this.configIni()).path?.["read-data"];
		if (!configDataPath) {
			throw "path.read-data missing in config.ini";
		}
		return path.posix.normalize(this.translatePath(configDataPath));
	}

	public async lualibPath() {
		return path.posix.normalize(path.resolve(await this.dataPath(), "core", "lualib"));
	}

	public async writeDataPath() {
		const configDataPath = (await this.configIni()).path?.["write-data"];
		if (!configDataPath) {
			throw "path.write-data missing in config.ini";
		}
		return path.posix.normalize(this.translatePath(configDataPath));
	}

	translatePath(p:string):string {
		if (p.startsWith("__PATH__executable__")) { return path.join(path.dirname(this.factorioPath), p.replace("__PATH__executable__", "")); }

		if (p.startsWith("__PATH__system-write-data__")) {
			// windows: %appdata%/Factorio
			// linux: ~/.factorio
			// mac: ~/Library/Application Support/factorio
			const syswrite =
				os.platform() === "win32" ? path.resolve(process.env.APPDATA!, "Factorio") :
				os.platform() === "linux" ? path.resolve(os.homedir(), ".factorio") :
				os.platform() === "darwin" ? path.resolve(os.homedir(), "Library/Application Support/factorio" ) :
				"??";
			return path.join(syswrite, p.replace("__PATH__system-write-data__", ""));
		}
		if (p.startsWith("__PATH__system-read-data__")) {
			// linux: /usr/share/factorio
			// mac: factorioPath/../data
			// else (windows,linuxsteam): factorioPath/../../data
			const sysread =
				os.platform() === "linux" ? "/usr/share/factorio" :
				os.platform() === "darwin" ? path.resolve(path.dirname(this.factorioPath), "../data" ) :
				path.resolve(path.dirname(this.factorioPath), "../../data" );

			return path.join(sysread, p.replace("__PATH__system-read-data__", ""));
		}

		return p;
	}

	public is(other:FactorioVersion) {
		const fv = this.fv;
		return fv.name === other.name &&
			fv.factorioPath === other.factorioPath &&
			fv.nativeDebugger === other.nativeDebugger &&
			fv.docsPath === other.docsPath &&
			fv.configPath === other.configPath;
	}
}
