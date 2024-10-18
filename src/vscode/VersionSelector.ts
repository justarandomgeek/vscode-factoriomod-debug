import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { URI, Utils } from "vscode-uri";
import type { DocSettings } from "../ApiDocs/DocSettings";
import { forkScript } from './ModPackageProvider';
import { version as bundleVersion } from "../../package.json";
import { ActiveFactorioVersion, FactorioVersion, substitutePathVariables, ApiDocGenerator, LuaLSAddon } from "../fmtk";
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
		private output:vscode.LogOutputChannel,
	) {
		this.bar = vscode.window.createStatusBarItem("factorio-version", vscode.StatusBarAlignment.Left, 10);
		this.bar.name = "Factorio Version Selector";
		this.bar.text = "Factorio (unselected)";
		this.bar.command = "factorio.selectVersion";

		this.bar.show();
		context.subscriptions.push(this.bar);

		context.subscriptions.push(vscode.commands.registerCommand("factorio.selectVersion", this.selectVersionCommand, this));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.checkConfig", this.checkConfigCommand, this));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.disablePrototypeCache", this.disablePrototypeCacheCommand, this));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.disableMouseAutoCapture", this.disableMouseAutoCaptureCommand, this));
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
		if (!docs) {
			delete active_version.active;
			config.update("versions", versions);
			return;
		}

		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		this._active_version = new ActiveFactorioVersion(vscode.workspace.fs, active_version, docs, vscode.workspace.workspaceFolders);
		this.output.info(`Active Factorio version: ${active_version.name} (${docs.application_version})`);

		this.checkDocs();
	}

	private async checkConfigCommand() {
		this.output.info(`Check Config:`);
		this.output.show();
		const activeVersion = await this.getActiveVersion();
		if (!activeVersion) {
			this.output.error(`No Active Factorio Version`);
			return;
		}
		this.output.info(`Active Factorio Version:`);
		this.output.info(`Binary: ${await activeVersion.getBinaryVersion().catch((reason)=>reason.toString())}`);
		this.output.info(`Runtime JSON: ${activeVersion.docs.application_version}`);

		if (await activeVersion.isPrototypeCacheEnabled()) {
			this.output.warn(`Prototype Cache is enabled!`);
		}

		if (await activeVersion.isMouseAutoCaptureDisabled()) {
			this.output.info(`Mouse Auto Capture is disabled`);
		}

		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) {
			this.output.error(`No Workspace`);
			return;
		}

		try {
			const filecontent = (await fs.readFile(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/config.json"))).toString();
			const config = JSON.parse(filecontent);
			this.output.info(`Library bundle found in ${workspaceLibrary.fsPath}, generated from Factorio ${config.factorioVersion} with FMTK ${config.bundleVersion}`);

			for (const file of await LuaLSAddon.getLuaFiles()) {
				try {
					const local = (await fs.readFile(Utils.joinPath(workspaceLibrary, "sumneko-3rd", file.name))).toString();
					if (local !== file.content) {
						this.output.info(`file ${file.name} content mismatch!`);
					}
				} catch (error) {
					this.output.error(`file ${file.name} ${error}`);
				}
			}
		} catch (error) {
			this.output.error(`Missing or damaged library bundle info ${error}`);
		}

		const luals = vscode.extensions.getExtension("sumneko.lua");
		if (!luals) {
			this.output.warn(`LuaLS (sumneko.lua) not present!`);
			return;
		}
		this.output.info(`LuaLS ${luals.packageJSON.version} ${luals.isActive?"Activated":"Not Yet Activated"}`);

		const luaconfig = vscode.workspace.getConfiguration("Lua");

		const userThirdParty = luaconfig.get<string[]>("workspace.userThirdParty");
		if (!userThirdParty) {
			this.output.warn(`Lua.workspace.userThirdParty not present!`);
		} else {
			const workspace3rd = Utils.joinPath(workspaceLibrary, "sumneko-3rd").fsPath;
			if (userThirdParty.includes(workspace3rd)) {
				this.output.info(`Lua.workspace.userThirdParty: workspace link OK (${workspace3rd})`);
			} else {
				this.output.warn(`Lua.workspace.userThirdParty: workspace link missing! (${workspace3rd})`);
			}

			const otherThird = userThirdParty.filter(s=>s!==workspace3rd);
			for (const other of otherThird) {
				if (other.match(/justarandomgeek\.factoriomod\-debug[\\\/]sumneko\-3rd$/)) {
					this.output.warn(`Lua.workspace.userThirdParty: stale workspace link? (${other})`);
				} else {
					this.output.info(`Lua.workspace.userThirdParty: other library (${other})`);
				}
			}
		}
		const checkThirdParty = luaconfig.get("workspace.checkThirdParty");
		const ApplyInMemory = checkThirdParty==="ApplyInMemory";
		if (checkThirdParty === false || checkThirdParty === "Disable") {
			this.output.warn(`Lua.workspace.checkThirdParty = ${checkThirdParty}`);
		} else {
			this.output.info(`Lua.workspace.checkThirdParty = ${checkThirdParty}`);
		}

		const library = luaconfig.get<string[]>("workspace.library");
		if (!library) {
			this.output.warn(`Lua.workspace.library not present!`);
		} else {
			const dataPath = URI.file(await activeVersion.dataPath()).fsPath;
			if (library.includes(dataPath)) {
				this.output.info(`Lua.workspace.library: /data link OK (${dataPath})`);
			} else {
				this.output.warn(`Lua.workspace.library: /data link missing! (${dataPath})`);
			}

			const workspaceLibPath = Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/library").fsPath;
			// luals sets this, so the slashes might be wrong. check more leniently, and use the found path later for exclusion
			const foundWorkspaceLibPath = library.find(l=>URI.file(l).fsPath === workspaceLibPath);
			if (foundWorkspaceLibPath) {
				if (ApplyInMemory) {
					this.output.warn(`Lua.workspace.library: redundant workspace library link (${foundWorkspaceLibPath})`);
				} else {
					this.output.info(`Lua.workspace.library: workspace library link OK (${foundWorkspaceLibPath})`);
				}
			} else {
				if (!ApplyInMemory) {
					this.output.warn(`Lua.workspace.library: workspace library link missing! (${workspaceLibPath})`);
				}
			}

			const otherLibs = library.filter(s=>!([dataPath, foundWorkspaceLibPath].includes(s)));
			for (const other of otherLibs) {
				if (other.match(/justarandomgeek\.factoriomod\-debug[\\\/]sumneko\-3rd[\\\/]factorio[\\\/]library$/)) {
					this.output.warn(`Lua.workspace.library: stale workspace link? (${other})`);
				} else if (other.endsWith("data")) {
					this.output.warn(`Lua.workspace.library: stale data link? (${other})`);
				} else {
					this.output.info(`Lua.workspace.library: other library (${other})`);
				}
			}
		}

		const plugin = luaconfig.get<string>("runtime.plugin");
		if (!plugin) {
			if (!ApplyInMemory) {
				this.output.warn(`Lua.runtime.plugin not present!`);
			}
		} else {
			const workspacePluginPath = Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/plugin.lua").fsPath.replace(/[\\]/g, "/");
			if (plugin === workspacePluginPath) {
				if (ApplyInMemory) {
					this.output.warn(`Lua.runtime.plugin: redundant workspace link (${plugin})`);
				} else {
					this.output.info(`Lua.runtime.plugin: OK (${plugin})`);
				}
			} else {
				this.output.warn(`Lua.runtime.plugin: wrong plugin? (${plugin})`);
			}
		}
	}

	private async disablePrototypeCacheCommand() {
		return (await this.getActiveVersion())?.disablePrototypeCache();
	}

	private async disableMouseAutoCaptureCommand() {
		return (await this.getActiveVersion())?.disableMouseAutoCapture();
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
				fv: undefined,
				label: "Select other version...",
			},
		]),
		{title: "Select Factorio Version"});
		if (!qpresult) { return; }

		let active_version = qpresult.fv;

		// check that the factorio binary referenced by qpresult.fv really still exists
		if (active_version) {
			let found = false;
			try {
				const stat = await fs.stat(URI.file(substitutePathVariables(active_version.factorioPath, vscode.workspace.workspaceFolders)));
				// eslint-disable-next-line no-bitwise
				if (stat.type & vscode.FileType.File) {
					found = true;
				}
			} catch (error) {}

			if (!found) {
				const action = await vscode.window.showErrorMessage(
					`The selected factorio version is no longer present at the specified location`,
					"Remove from settings", "Cancel");
				switch (action) {
					case "Remove from settings":
						config.update("versions", versions.filter(v=>v!==active_version));
						return;
					default:
						return;
				}
			}
		}

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
				placeHolder: "Enter a display name to be used in the Version Selector for this version",
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
				openLabel: "Select Runtime JSON Docs",
				title: "Select Runtime JSON Docs",
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
		this.output.info(`Active Factorio version: ${active_version.name} (${docs.application_version})`);

		await this.generateDocs(previous_active);
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
		const docsettings = await vscode.workspace.getConfiguration("factorio").get<DocSettings>("docs", {});
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
			const filecontent = (await fs.readFile(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/config.json"))).toString();
			const config = JSON.parse(filecontent);
			if (config.factorioVersion !== activeVersion.docs.application_version ||
				config.bundleVersion !== bundleVersion) {
				// version tags mismatch, go ahead and regen...
				this.generateDocs();
				return;
			}
		} catch (error) {
			// no config.json at all
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
			vscode.window.showErrorMessage("Unable to generate docs: no open workspace");
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

		const docargs = [
			"sumneko-3rd",
			"-d", activeVersion.docsPath,
			"-p", activeVersion.protosPath,
		];

		await forkScript(
			{ close() {}, write(data) {} },
			this.context.asAbsolutePath("./dist/fmtk-cli.js"),
			docargs, sumneko3rd.fsPath);

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

		if (previous_active) {
			const oldroot = URI.file(await previous_active.dataPath());
			removeLibraryPath(oldroot);
		}

		if (library.length === 0) {
			await luaconfig.update("workspace.library", undefined);
		} else {
			await luaconfig.update("workspace.library", library);
		}

		if (factorioconfig.get("workspace.manageLibraryDataLinks", true)) {
			const newroot = URI.file(await activeVersion.dataPath());
			await addLibraryPath(newroot);
		}

		if (library.length === 0) {
			await luaconfig.update("workspace.library", undefined);
		} else {
			await luaconfig.update("workspace.library", library);
		}

		let userThirdParty = luaconfig.get<string[]>("workspace.userThirdParty", []);

		const path = Utils.joinPath(workspaceLibrary, "sumneko-3rd").fsPath;
		// remove any mismatched entries and re-register the current one...
		userThirdParty = userThirdParty.filter(s=>{
			return !s.includes("justarandomgeek.factoriomod-debug");
		});
		// do the double-update on this to force luals to reload if we didn't actually change library links
		await luaconfig.update("workspace.userThirdParty", userThirdParty);
		userThirdParty.push(path);
		await luaconfig.update("workspace.userThirdParty", userThirdParty);

		const checkThirdParty = luaconfig.get<string|undefined>("workspace.checkThirdParty");
		if (!(checkThirdParty && ["Ask", "Apply", "ApplyInMemory"].includes(checkThirdParty))) {
			await luaconfig.update("workspace.checkThirdParty", "ApplyInMemory");
		}

		const sumneko = vscode.extensions.getExtension("sumneko.lua");
		if (sumneko) {
			if (!sumneko.isActive) {
				await sumneko.activate();
			}
		}
	}
}
