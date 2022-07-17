import * as vscode from 'vscode';
import * as ini from 'ini';
import * as os from 'os';
import * as path from 'path';
import { Uri } from "vscode";
import { ApiDocGenerator } from './ApiDocs/ApiDocGenerator';
const fs = vscode.workspace.fs;
interface FactorioVersion {
	name: string
	active?: true

	factorioPath: string
	configPath?: string
	docsPath?: string

	nativeDebugger?: string
}

function substitutePathVariables(aPath:string) {
	if (aPath.match(/^~[\\\/]/)){
		aPath = path.posix.join(
			os.homedir().replace(/\\/g,"/"),
			aPath.replace(/^~[\\\/]/,"") );
	}

	aPath = aPath.replace("${userHome}", os.homedir());

	if (vscode.workspace.workspaceFolders?.[0]){
		aPath = aPath.replace("${workspaceFolder}", vscode.workspace.workspaceFolders[0].uri.fsPath);
	}

	aPath = aPath.replace(/\$\{env:(\w+)}/g, (match, p1) => process.env[p1] ?? match);

	return aPath;
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


export class ActiveFactorioVersion {
	constructor(
		private readonly fv:FactorioVersion,
		public readonly docs:ApiDocGenerator,
		) {
	}


	public get name() {
		return this.fv.name;
	}

	public get factorioPath() {
		return substitutePathVariables(this.fv.factorioPath);
	}

	public configPathIsOverriden() {
		return !!this.fv.configPath;
	}
	public async configPath() {
		if (this.fv.configPath) {
			return substitutePathVariables(this.fv.configPath);
		}

		// find config-path.cfg then config.ini and dataPath/modsPath defaults
		const cfgpath = path.resolve(path.dirname(this.factorioPath), "../../config-path.cfg" );
		try {
			const configdata = ini.parse((await fs.readFile(Uri.file(cfgpath))).toString());
			return path.resolve(
				this.translatePath(configdata["config-path"]),
				"./config.ini");
		} catch (error) {
		}
		// try for a config.ini in systemwritepath
		return this.translatePath("__PATH__system-write-data__/config/config.ini");
	}

	public get nativeDebugger() {
		return this.fv.nativeDebugger && substitutePathVariables(this.fv.nativeDebugger);
	}


	private iniData? : FactorioConfigIni|Thenable<FactorioConfigIni>;
	private async configIni() {
		if (!this.iniData) {
			this.iniData =
				fs.readFile(Uri.file(await this.configPath()))
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
		const configUri = Uri.file(await this.configPath());
		let filedata = (await fs.readFile(configUri)).toString();
		filedata = filedata.replace("cache-prototype-data=","; cache-prototype-data=");
		await fs.writeFile(configUri, Buffer.from(filedata));
		this.iniData = ini.parse(filedata);
	}

	public async checkSteamAppID() {
		const factorioPath = Uri.file(this.factorioPath);
		const stats = await Promise.allSettled(
			[ "../steam_api64.dll", "../libsteam_api.dylib", "../libsteam_api.so"]
			.map(s=>fs.stat(Uri.joinPath(factorioPath,s)))
			);
		if (stats.find(psr=>psr.status==="fulfilled")){
			const appidUri = Uri.joinPath(factorioPath,"../steam_appid.txt");
			const appidStat = await Promise.allSettled([fs.stat(appidUri)]);
			if (!appidStat.find(psr=>psr.status==="fulfilled"))
			{
				if("Yes" === await vscode.window.showInformationMessage("This is a steam install, and will require `steam_appid.txt` in order to be used for debugging. Create it now?","Yes","No")){
					try {
						fs.writeFile(appidUri,Buffer.from("427520"));
					} catch (error) {
						vscode.window.showErrorMessage(`failed to write "427520" to ${appidUri}: ${error}`);
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
		return path.posix.normalize(path.resolve(this.translatePath(configModsPath),"mods"));
	}

	public async dataPath() {
		const configDataPath = (await this.configIni()).path?.["read-data"];
		if (!configDataPath) {
			throw "path.read-data missing in config.ini";
		}
		return path.posix.normalize(this.translatePath(configDataPath));
	}

	public async lualibPath() {
		return path.posix.normalize(path.resolve(await this.dataPath(),"core","lualib"));
	}

	public async writeDataPath() {
		const configDataPath = (await this.configIni()).path?.["write-data"];
		if (!configDataPath) {
			throw "path.write-data missing in config.ini";
		}
		return path.posix.normalize(this.translatePath(configDataPath));
	}

	translatePath(p:string):string {
		if (p.startsWith("__PATH__executable__"))
			{return path.join(path.dirname(this.factorioPath),p.replace("__PATH__executable__",""));}

		if (p.startsWith("__PATH__system-write-data__"))
		{
			// windows: %appdata%/Factorio
			// linux: ~/.factorio
			// mac: ~/Library/Application Support/factorio
			const syswrite =
				os.platform() === "win32" ? path.resolve(process.env.APPDATA!,"Factorio") :
				os.platform() === "linux" ? path.resolve(os.homedir(), ".factorio") :
				os.platform() === "darwin" ? path.resolve(os.homedir(), "Library/Application Support/factorio" ) :
				"??";
			return path.join(syswrite,p.replace("__PATH__system-write-data__",""));
		}
		if (p.startsWith("__PATH__system-read-data__"))
		{
			// linux: /usr/share/factorio
			// mac: factorioPath/../data
			// else (windows,linuxsteam): factorioPath/../../data
			const sysread =
				os.platform() === "linux" ? "/usr/share/factorio" :
				os.platform() === "darwin" ? path.resolve(path.dirname(this.factorioPath), "../data" ) :
				path.resolve(path.dirname(this.factorioPath), "../../data" );

			return path.join(sysread,p.replace("__PATH__system-read-data__",""));
		}

		return p;
	}
}




const detectPaths:FactorioVersion[] = [
	{name: "Steam", factorioPath: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe"},
	{name: "System", factorioPath: "C:\\Program Files\\Factorio\\bin\\x64\\factorio.exe"},
	{name: "Steam", factorioPath: "~/Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/MacOS/factorio"},
	{name: "System", factorioPath: "/Applications/factorio.app/Contents/MacOS/factorio"},
	{name: "Home", factorioPath: "~/.factorio/bin/x64/factorio"},
];

export class FactorioVersionSelector {
	private readonly bar:vscode.StatusBarItem;

	constructor(
		context:vscode.ExtensionContext,
		) {
		this.bar = vscode.window.createStatusBarItem("factorio-version",vscode.StatusBarAlignment.Left,10);
		this.bar.name = "Factorio Version Selector";
		this.bar.text = "Factorio (unselected)";
		this.bar.command = "factorio.selectVersion";

		this.bar.show();
		context.subscriptions.push(this.bar);

		context.subscriptions.push(vscode.commands.registerCommand("factorio.selectVersion", this.selectVersionCommand, this));
		this.loadActiveVersion();

		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{
			if (e.affectsConfiguration("factorio.versions"))
			{
				this.loadActiveVersion();
			}
		}));
	}

	private async loadActiveVersion() {
		const config = vscode.workspace.getConfiguration("factorio");
		const versions = config.get<FactorioVersion[]>("versions", []);

		const active_version = versions.find(fv=>fv.active);
		if (!active_version) { return; }
		const docs =  await this.tryJsonDocs(active_version);
		if (!docs) { return; }

		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		this._active_version = new ActiveFactorioVersion(active_version, docs);
	}

	private async selectVersionCommand() {
		if (vscode.debug.activeDebugSession?.type==="factoriomod") {
			vscode.window.showInformationMessage("Cannot select Factorio version while debugging.");
			return;
		}
		const config = vscode.workspace.getConfiguration("factorio");
		const versions = config.get<FactorioVersion[]>("versions", []);

		const hasversions = versions.map(v=>v.factorioPath);

		const detectedVersions = (await Promise.all(
			detectPaths
			.filter(s=>!hasversions.includes(s.factorioPath))
			.map(async s=>{
				try {
					const stat = await fs.stat(Uri.file(substitutePathVariables(s.factorioPath)));
					// eslint-disable-next-line no-bitwise
					if (stat.type & vscode.FileType.File) {
						return s;
					} else {
						return undefined;
					}
				} catch (error) {
					return undefined;
				}
			}))).filter((v):v is FactorioVersion=>!!v);

		const qpresult = await vscode.window.showQuickPick(Promise.all([
			...versions.map(async fv=>({
				fv: fv,
				label: fv.name,
				description: (await this.tryJsonDocs(fv))?.application_version,
				detail: fv.factorioPath,
				picked: fv.active,
			})),
			...detectedVersions.map(async fv=>({
				fv: fv,
				label: `${fv.name} (autodetected)`,
				description: (await this.tryJsonDocs(fv))?.application_version,
				detail: fv.factorioPath,
			})),
			{
				label: "Select other version...",
			},
		]),
		{title: "Select Factorio Version"});
		if (!qpresult) { return; }

		let active_version = ("fv" in qpresult) && qpresult.fv;
		if (!active_version) {
			// file picker for undiscovered factorios
			const factorioPath = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: "Select Factorio binary",
				filters: os.platform() === "win32" ? { "": ["exe"] } : undefined
			});
			if (!factorioPath) { return; }

			const newName = await vscode.window.showInputBox({
				prompt: "Display Name for this version",
			});
			if (!newName) { return; }

			active_version = {
				name: newName,
				factorioPath: factorioPath[0].fsPath,
			};
		}

		// check for docs json
		let docs;
		try {
			docs = await this.tryJsonDocs(active_version, true);
		} catch (error) {
			if ("Select alternate location" !== await vscode.window.showErrorMessage(`Unable to read JSON docs: ${error}`,"Select alternate location","Cancel")) {
				return;
			}

			const file = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: "Select JSON Docs",
				title: "Select JSON Docs",
				filters:{ "JSON Docs":["json"] }
			});
			if (!file) { return; }
			active_version.docsPath = path.relative(substitutePathVariables(active_version.factorioPath), file[0].fsPath);
			try {
				docs = await this.tryJsonDocs(active_version, true);
			} catch (error) {
				vscode.window.showErrorMessage(`Unable to read JSON docs: ${error}`);
				return;
			}
		}

		// if selected isn't in `versions`, put it in
		if (!versions.includes(active_version)){
			versions.push(active_version);
		}

		// mark selected as `active`
		versions.forEach(fv=>delete fv.active);
		active_version.active = true;

		config.update("versions", versions);
		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		const previous_active = this._active_version;
		this._active_version = new ActiveFactorioVersion(active_version, docs);

		await Promise.allSettled([
			this.generateDocs(previous_active),
			this._active_version.checkSteamAppID(),
		]);
	}

	private _active_version?: ActiveFactorioVersion;
	public async getActiveVersion() {
		if (!this._active_version)
		{
			await this.selectVersionCommand();
		}
		return this._active_version;
	}

	private async tryJsonDocs(fv:FactorioVersion,throwOnError?:false): Promise<ApiDocGenerator|undefined>
	private async tryJsonDocs(fv:FactorioVersion,throwOnError:true) : Promise<ApiDocGenerator>
	private async tryJsonDocs(fv:FactorioVersion,throwOnError?:boolean) {
		const docpath = Uri.joinPath(Uri.file(substitutePathVariables(fv.factorioPath)),
			fv.docsPath ? fv.docsPath :
			(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
			"../../../doc-html/runtime-api.json"
			);
		const docsettings = vscode.workspace.getConfiguration("factorio.docs");
		try {
			return new ApiDocGenerator((await fs.readFile(docpath)).toString(), docsettings);
		} catch (error) {
			if (!throwOnError) { return; }
			throw error;
		}
	}

	private findWorkspaceLibraryFolder() {
		const config = vscode.workspace.getConfiguration("factorio");
		const library = config.get<string>("workspace.library");
		if (library) { return Uri.file(substitutePathVariables(library)); }

		const a = vscode.workspace.workspaceFolders?.find(wf=>wf.name===".vscode")?.uri;
		if (a) { return Uri.joinPath(a, "factorio"); }

		const b = vscode.workspace.workspaceFolders?.[0]?.uri;
		if (b) { return Uri.joinPath(b, ".vscode", "factorio"); }

		return;
	}

	private async generateDocs(previous_active?:ActiveFactorioVersion) {
		const activeVersion = await this.getActiveVersion();
		if (!activeVersion) {return;}
		const workspaceLibrary = this.findWorkspaceLibraryFolder();
		if (!workspaceLibrary) {
			vscode.window.showErrorMessage("Unable to generate docs: cannot locate workspace library");
			return;
		}

		try {
			await Promise.all(
				(await fs.readDirectory(workspaceLibrary))
				.map(async ([name,type])=>{
					if (name.match(/runtime\-api.+\.lua/))
					{
						return fs.delete(Uri.joinPath(workspaceLibrary,name),{useTrash:true});
					}
				}));
		} catch (error) {
		}

		const maxDocSize = await activeVersion.docs.generate_sumneko_docs(
			async (filename:string,buff:Buffer)=>{
				const save = Uri.joinPath(workspaceLibrary, filename);
				await fs.writeFile(save,buff);
			});

		const luaconfig = vscode.workspace.getConfiguration("Lua");

		const preloadFileSize = luaconfig.get<number>("workspace.preloadFileSize",0);
		const docFileSize = Math.trunc(maxDocSize/1000)+1;
		if (preloadFileSize < docFileSize) {
			if ((await vscode.window.showWarningMessage(`workspace.preloadFileSize value ${preloadFileSize}kb is too small to load the generated definitions file (${docFileSize}kb). Increase workspace.preloadFileSize?`,"Yes","No")) === "Yes") {
				luaconfig.update("workspace.preloadFileSize",docFileSize);
			}
		}

		const globals = luaconfig.get<string[]>("diagnostics.globals") ?? [];
		[
			"mods", "table_size", "log", "localised_print", "serpent",
			"__DebugAdapter", "__Profiler",
		].forEach(s=>{
			if (!globals.includes(s))
			{
				globals.push(s);
			}
		});
		luaconfig.update("diagnostics.globals", globals);

		luaconfig.update("runtime.version", "Lua 5.2");


		const library: string[] = luaconfig.get("workspace.library") ?? [];

		const replaceLibraryPath = async (newroot:Uri,oldroot?:Uri, ...seg:string[]) => {
			const newpath = Uri.joinPath(newroot,...seg);
			try {
				if (!library.includes(newpath.fsPath) &&
					// eslint-disable-next-line no-bitwise
					((await fs.stat(newpath)).type & vscode.FileType.Directory)) {
					library.push(newpath.fsPath);
				}
			} catch {}
			if (oldroot) {
				const oldpath = Uri.joinPath(oldroot,...seg);
				const oldindex = library.indexOf(oldpath.fsPath);
				if (oldindex !== -1 && newpath.fsPath !== oldpath.fsPath) {
					library.splice(oldindex,1);
				}
			}
		};

		const factorioconfig = vscode.workspace.getConfiguration("factorio");

		if (factorioconfig.get("workspace.manageLibraryDataLinks", true)) {
			const newroot = Uri.file(await activeVersion.dataPath());
			const oldroot = previous_active ? Uri.file(await previous_active.dataPath()) : undefined;

			await replaceLibraryPath(newroot,oldroot);
			await replaceLibraryPath(newroot,oldroot,"core","lualib");
		}

		if (factorioconfig.get("workspace.manageLibraryDocsLink", true)) {
			const workspacelib = vscode.workspace.asRelativePath(workspaceLibrary);
			if (!library.includes(workspacelib)) {
				library.push(workspacelib);
			}
		}

		luaconfig.update("workspace.library", library);

	}
}
