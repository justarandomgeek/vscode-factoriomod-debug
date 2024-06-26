import type * as vscode from 'vscode';
import * as ini from 'ini';
import * as os from 'os';
import * as path from 'path';
import { URI } from "vscode-uri";
import type { ApiDocGenerator } from '../ApiDocs/ApiDocGenerator';
import { execFile } from 'child_process';

export interface FactorioVersion {
	name: string
	active?: true

	factorioPath: string
	configPath?: string
	docsPath?: string
	protosPath?: string

	nativeDebugger?: string
	nativeDAP?: boolean
}


interface FactorioConfigIni {
	path?:{
		"read-data"?:string
		"write-data"?:string
	}
	other?:{
		"cache-prototype-data"?:boolean
		"disable-mouse-auto-capture"?:boolean
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

	public async getBinaryVersion():Promise<string> {
		return new Promise((resolve, reject)=>{
			execFile(
				this.factorioPath, ["--version"],
				{
					env: Object.assign({}, process.env, {SteamAppId: "427520"}),
				},
				(error, stdout, stderr)=>{
					if (error) { reject(error); }

					const version = stdout.match(/^Version: ([0-9\.]+) /);
					if (version) {
						resolve(version[1]);
					}

					reject(new Error("Unable to read version"));
				});
		});
	}

	public async debugLaunchArgs() {
		const args:string[] = [];
		args.push(this.factorioPath);
		if (this.fv.docsPath) {
			args.push("--docs", this.fv.docsPath);
		}
		if (this.configPathIsOverriden()) {
			args.push("--config", await this.configPath());
		}
		if (this.workspaceFolders) {
			args.push("--workspace", ...this.workspaceFolders.map(wf=>wf.uri.fsPath));
		}
		return args;
	}

	public get name() {
		return this.fv.name;
	}

	public get factorioPath() {
		return substitutePathVariables(this.fv.factorioPath, this.workspaceFolders);
	}

	public get docsPath() {
		return path.join(this.factorioPath,
			this.fv.docsPath ? this.fv.docsPath :
			(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
			"../../../doc-html/runtime-api.json"
		);
	}

	public get protosPath() {
		return path.join(this.factorioPath,
			this.fv.protosPath ? this.fv.protosPath :
			this.fv.docsPath ? path.join(this.fv.docsPath, "../prototype-api.json") :
			(os.platform() === "darwin") ? "../../doc-html/prototype-api.json" :
			"../../../doc-html/prototype-api.json"
		);
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

	public get nativeDAP() {
		return this.fv.nativeDAP;
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
		try {
			let configIni = await this.configIni();
			return configIni.other?.["cache-prototype-data"];
		} catch (error) {
			return undefined;
		}
	}

	public async disablePrototypeCache() {
		this.iniData = undefined;
		const configUri = URI.file(await this.configPath());
		let filedata = (await this.fs.readFile(configUri)).toString();
		filedata = filedata.replace("cache-prototype-data=", "; cache-prototype-data=");
		await this.fs.writeFile(configUri, Buffer.from(filedata));
		this.iniData = ini.parse(filedata);
	}

	public async isMouseAutoCaptureDisabled() {
		try {
			let configIni = await this.configIni();
			return configIni.other?.["disable-mouse-auto-capture"];
		} catch (error) {
			return undefined;
		}
	}

	public async disableMouseAutoCapture() {
		this.iniData = undefined;
		const configUri = URI.file(await this.configPath());
		let filedata = (await this.fs.readFile(configUri)).toString();

		const match = filedata.match(/^;? *disable-mouse-auto-capture=.*$/m);
		if (match) {
			filedata =
				filedata.slice(0, match.index) +
				`\ndisable-mouse-auto-capture=true\n` +
				filedata.slice(match.index! + match[0].length);
		} else {
			const other = filedata.match(/^\[other\]$/m);
			filedata =
				filedata.slice(0, other!.index! + other![0].length) +
				`\ndisable-mouse-auto-capture=true\n` +
				filedata.slice(other!.index! + other![0].length);
		}

		await this.fs.writeFile(configUri, Buffer.from(filedata));
		this.iniData = ini.parse(filedata);
	}

	public async defaultModsPath() {
		const configModsPath = (await this.configIni())?.path?.["write-data"];
		if (!configModsPath) {
			throw "path.write-data missing in config.ini";
		}
		return path.posix.normalize(path.resolve(this.translatePath(configModsPath), "mods"));
	}

	public async dataPath() {
		const configDataPath = (await this.configIni().catch(()=>{
			return {
				path: {
					["read-data"]: "__PATH__executable__/../../data",
				},
			};
		})).path?.["read-data"];
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
			fv.protosPath === other.protosPath &&
			fv.configPath === other.configPath;
	}
}
