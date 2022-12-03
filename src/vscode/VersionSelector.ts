import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { URI, Utils } from "vscode-uri";
import { ApiDocGenerator } from '../ApiDocs/ApiDocGenerator';
import { ActiveFactorioVersion, FactorioVersion, substitutePathVariables } from './FactorioVersion';
import { forkScript } from './ModPackageProvider';
import { version as bundleVersion } from "../../package.json";
const fs = vscode.workspace.fs;

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
		private context:vscode.ExtensionContext,
	) {
		this.bar = vscode.window.createStatusBarItem("factorio-version", vscode.StatusBarAlignment.Left, 10);
		this.bar.name = "Factorio Version Selector";
		this.bar.text = "Factorio (unselected)";
		this.bar.command = "factorio.selectVersion";

		this.bar.show();
		context.subscriptions.push(this.bar);

		context.subscriptions.push(vscode.commands.registerCommand("factorio.selectVersion", this.selectVersionCommand, this));
		this.loadActiveVersion();

		context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{
			if (e.affectsConfiguration("factorio.versions")) {
				this.loadActiveVersion();
			}
		}));
	}

	private async loadActiveVersion() {
		const config = vscode.workspace.getConfiguration("factorio");
		const versions = config.get<FactorioVersion[]>("versions", []);

		const active_version = versions.find(fv=>fv.active);
		// no active version in settings...
		if (!active_version) { return; }

		// active version in settings is already active live
		if (this._active_version && this._active_version.is(active_version)) { return; }

		const docs =  await this.tryJsonDocs(active_version);

		// can't activate without docs...
		if (!docs) { return; }

		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		this._active_version = new ActiveFactorioVersion(vscode.workspace.fs, active_version, docs, vscode.workspace.workspaceFolders);

		this.checkDocs();
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
						const stat = await fs.stat(URI.file(substitutePathVariables(s.factorioPath, vscode.workspace.workspaceFolders)));
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
				filters: os.platform() === "win32" ? { "": ["exe"] } : undefined,
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
			if ("Select alternate location" !== await vscode.window.showErrorMessage(`Unable to read JSON docs: ${error}`, "Select alternate location", "Cancel")) {
				return;
			}

			const file = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: "Select JSON Docs",
				title: "Select JSON Docs",
				filters: { "JSON Docs": ["json"] },
			});
			if (!file) { return; }
			active_version.docsPath = path.relative(substitutePathVariables(active_version.factorioPath, vscode.workspace.workspaceFolders), file[0].fsPath);
			try {
				docs = await this.tryJsonDocs(active_version, true);
			} catch (error) {
				vscode.window.showErrorMessage(`Unable to read JSON docs: ${error}`);
				return;
			}
		}

		// if selected isn't in `versions`, put it in
		if (!versions.includes(active_version)) {
			versions.push(active_version);
		}

		// mark selected as `active`
		versions.forEach(fv=>delete fv.active);
		active_version.active = true;

		config.update("versions", versions);
		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		const previous_active = this._active_version;
		this._active_version = new ActiveFactorioVersion(vscode.workspace.fs, active_version, docs, vscode.workspace.workspaceFolders);

		await Promise.allSettled([
			this.generateDocs(previous_active),
			this._active_version.checkSteamAppID(vscode.window),
		]);
	}

	private _active_version?: ActiveFactorioVersion;
	public async getActiveVersion() {
		if (!this._active_version) {
			await this.selectVersionCommand();
		}
		return this._active_version;
	}

	private async tryJsonDocs(fv:FactorioVersion, throwOnError?:false): Promise<ApiDocGenerator|undefined>;
	private async tryJsonDocs(fv:FactorioVersion, throwOnError:true) : Promise<ApiDocGenerator>;
	private async tryJsonDocs(fv:FactorioVersion, throwOnError?:boolean) {
		const docpath = Utils.joinPath(URI.file(substitutePathVariables(fv.factorioPath, vscode.workspace.workspaceFolders)),
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

	private async checkDocs() {
		const activeVersion = await this.getActiveVersion();
		if (!activeVersion) { return; }
		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) { return; }

		try {
			const file = (await fs.readDirectory(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/library"))).find(([name, type])=>name.match(/runtime\-api.+\.lua/));
			if (!file) {
				// no generated files?
				this.generateDocs();
				return;
			}

			const filecontent = (await fs.readFile(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/library", file[0]))).toString();

			const matches = filecontent.match(/--\$Factorio ([^\n]*)\n--\$(?:Overlay|Generator) ([^\n]*)\n/m);
			if (!matches) {
				// no header at all? offer to regen...
				this.generateDocs();
				return;
			}

			if (matches[1] !== activeVersion.docs.application_version || matches[2] !== bundleVersion) {
				// header mismatch, offer to regen...
				this.generateDocs();
				return;
			}
		} catch (error) {
			// failed to check existing files at all...
			this.generateDocs();
			return;
		}
	}

	private async generateDocs(previous_active?:ActiveFactorioVersion) {
		if (!vscode.workspace.getConfiguration("factorio").get("docs.generateDocs", true)) { return; }
		const activeVersion = await this.getActiveVersion();
		if (!activeVersion) { return; }
		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) {
			vscode.window.showErrorMessage("Unable to generate docs: cannot locate workspace library");
			return;
		}

		const sumneko3rd = Utils.joinPath(workspaceLibrary, "sumneko-3rd");
		await fs.createDirectory(sumneko3rd);

		try {
			await Promise.allSettled([
				fs.delete(Utils.joinPath(sumneko3rd, "factorio", "library"), {recursive: true}),
				fs.delete(Utils.joinPath(sumneko3rd, "factorio", "factorio-plugin"), {recursive: true}),
			]);
		} catch (error) {
		}

		await forkScript(
			{ close() {}, write(data) {} },
			this.context.asAbsolutePath("./dist/fmtk.js"),
			[
				"sumneko-3rd",
				"-d", activeVersion.docsPath,
			],
			sumneko3rd.fsPath);

		const luaconfig = vscode.workspace.getConfiguration("Lua");

		const library = luaconfig.get<string[]>("workspace.library", []);

		const removeLibraryPath = (oldroot:URI, ...seg:string[])=>{
			if (oldroot) {
				const oldpath = Utils.joinPath(oldroot, ...seg);
				const oldindex = library.indexOf(oldpath.fsPath);
				if (oldindex !== -1) {
					library.splice(oldindex, 1);
				}
			}
		};

		const addLibraryPath =async (newroot:URI, ...seg:string[])=>{
			try {
				const newpath = Utils.joinPath(newroot, ...seg);
				if (!library.includes(newpath.fsPath) &&
					// eslint-disable-next-line no-bitwise
					((await fs.stat(newpath)).type & vscode.FileType.Directory)) {
					library.push(newpath.fsPath);
				}
			} catch {}
		};

		// remove and re-add library links to force sumneko to update...
		const factorioconfig = vscode.workspace.getConfiguration("factorio");

		if (previous_active && factorioconfig.get("workspace.manageLibraryDataLinks", true)) {
			const oldroot = URI.file(await previous_active.dataPath());
			removeLibraryPath(oldroot);
		}

		await luaconfig.update("workspace.library", library);

		if (factorioconfig.get("workspace.manageLibraryDataLinks", true)) {
			const newroot = URI.file(await activeVersion.dataPath());
			await addLibraryPath(newroot);
		}

		await luaconfig.update("workspace.library", library);

		const userThirdParty = await luaconfig.get<string[]>("workspace.userThirdParty", []);
		const path = Utils.joinPath(workspaceLibrary, "sumneko-3rd").fsPath;
		if (!userThirdParty.includes(path)) {
			userThirdParty.push(path);
		}
		await luaconfig.update("workspace.userThirdParty", userThirdParty);

		const sumneko = vscode.extensions.getExtension("sumneko.lua");
		if (sumneko && !sumneko.isActive) {
			await sumneko.activate();
		}
	}
}
