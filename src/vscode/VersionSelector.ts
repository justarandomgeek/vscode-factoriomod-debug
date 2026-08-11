import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { URI, Utils } from "vscode-uri";
import { applyEdits, modify } from "jsonc-parser";
import { forkScript } from './ModPackageProvider';
import { version as bundleVersion } from "../../package.json";
import type { FactorioVersion, LocalFactorioVersion } from "../vscode/FactorioVersion";
import { ActiveFactorioVersion, substitutePathVariables } from "../vscode/FactorioVersion";
import { ApiDocGenerator } from "../ApiDocs/ApiDocGenerator";
import * as LuaLSAddon from "../LuaLSAddon";
import type { FSProvider } from './FSProvider';
const fs = vscode.workspace.fs;

const detectPaths:LocalFactorioVersion[] = [
	{name: "Steam", factorioPath: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Factorio\\bin\\x64\\factorio.exe"},
	{name: "System", factorioPath: "C:\\Program Files\\Factorio\\bin\\x64\\factorio.exe"},
	{name: "Steam", factorioPath: "~/Library/Application Support/Steam/steamapps/common/Factorio/factorio.app/Contents/MacOS/factorio"},
	{name: "System", factorioPath: "/Applications/factorio.app/Contents/MacOS/factorio"},
	{name: "Steam", factorioPath: "~/.local/share/Steam/steamapps/common/Factorio/bin/x64/factorio"},
	{name: "Home", factorioPath: "~/.factorio/bin/x64/factorio"},
];

const onlineLatest:FactorioVersion = {
	name: "Online Latest",
	onlineDocs: true,
};
const onlineStable:FactorioVersion = {
	name: "Online Stable",
	onlineDocs: "stable",
};

const emmylua_ids = [
	"tangzx.emmylua",
	"xuhuanzy.emmylua-luals",
];

export class FactorioVersionSelector {
	private readonly bar:vscode.StatusBarItem;


	private context:vscode.ExtensionContext;
	private output:vscode.LogOutputChannel;
	private fsprovider:FSProvider;

	constructor(
		context:vscode.ExtensionContext,
		output:vscode.LogOutputChannel,
		fsprovider:FSProvider
	) {
		this.context = context;
		this.output = output;
		this.fsprovider = fsprovider;

		this.bar = vscode.window.createStatusBarItem("factorio-version", vscode.StatusBarAlignment.Left, 10);
		this.bar.name = "Factorio Version Selector";
		this.bar.text = "Factorio (unselected)";
		this.bar.command = "factorio.selectVersion";

		this.bar.show();
		context.subscriptions.push(this.bar);

		context.subscriptions.push(vscode.commands.registerCommand("factorio.selectVersion", ()=>this.selectVersionCommand()));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.checkConfig", ()=>this.checkConfigCommand()));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.disablePrototypeCache", ()=>this.disablePrototypeCacheCommand()));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.disableMouseAutoCapture", ()=>this.disableMouseAutoCaptureCommand()));

		void this.migrateActiveVersion().then(()=>this.loadActiveVersion());
	}

	private async migrateActiveVersion() {
		// already have one in new storage...
		if (this.context.workspaceState.get<FactorioVersion>("active_version")) { return; }

		const config = vscode.workspace.getConfiguration("factorio");
		const versions = config.get<FactorioVersion[]>("versions", []);

		// eslint-disable-next-line @typescript-eslint/no-deprecated
		const old_active_version = versions.find(fv=>fv.active);
		if (old_active_version) {
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			versions.forEach(fv=>delete fv.active);

			await this.context.workspaceState.update("active_version", old_active_version);
			await config.update("versions", versions);
		}
	}

	private async loadActiveVersion() {
		const active_version = this.context.workspaceState.get<FactorioVersion>("active_version");
		// no active version in settings...
		if (!active_version) { return; }

		//TODO: try to guess? fallback to online-only?
		// but probably don't want to clutter up every workspace ever opened!

		const docs =  await this.tryJsonDocs(active_version).catch(()=>undefined);

		// can't activate without docs...
		if (!docs) {
			await this.context.workspaceState.update("active_version", undefined);
			return;
		}

		this.bar.text = `Factorio ${docs.application_version} (${active_version.name})`;
		this._active_version = new ActiveFactorioVersion(vscode.workspace.fs, active_version, docs, vscode.workspace.workspaceFolders);
		this.output.info(`Active Factorio version: ${active_version.name} (${docs.application_version})`);

		await this.checkDocs();
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
		if (activeVersion.onlineOnly) {
			this.output.info(`Online Only`);
		} else {
			this.output.info(`Binary: ${await activeVersion.getBinaryVersion().catch((reason)=>reason.toString())}`);
		}
		this.output.info(`Runtime JSON: ${activeVersion.docs.application_version}`);

		if (!activeVersion.onlineOnly) {
			if (await activeVersion.isPrototypeCacheEnabled()) {
				this.output.warn(`Prototype Cache is enabled!`);
			}

			if (await activeVersion.isMouseAutoCaptureDisabled()) {
				this.output.info(`Mouse Auto Capture is disabled`);
			}
		}

		this.output.info(`Workspace Trusted: ${vscode.workspace.isTrusted}`);

		vscode.workspace.workspaceFolders?.forEach(wf=>this.output.info(`Workspace folder: ${wf.uri.toString()}`));

		const factorioconfig = vscode.workspace.getConfiguration("factorio");

		this.output.info(`execArgv: ${JSON.stringify(process.execArgv)}`);
		this.output.info(`execArgvOptions: ${JSON.stringify(factorioconfig.get("tasks.execArgvOptions", []))}`);
		this.output.info(`execArgvExtras: ${JSON.stringify(factorioconfig.get("tasks.execArgvExtras", []))}`);

		const luals = vscode.extensions.getExtension("sumneko.lua");
		if (luals) {
			await this.checkLuaLSConfig(luals, activeVersion, factorioconfig);
		} else {
			this.output.info(`LuaLS (sumneko.lua) not present`);
		}

		for (const id of emmylua_ids) {
			const emmylua = vscode.extensions.getExtension(id);
			if (emmylua) {
				await this.checkEmmyLuaConfig(emmylua, activeVersion, factorioconfig);
			} else {
				this.output.info(`EmmyLua (${id}) not present`);
			}
		};
	}

	private async checkEmmyLuaConfig(emmylua: vscode.Extension<any>, activeVersion: ActiveFactorioVersion, factorioconfig: vscode.WorkspaceConfiguration) {
		this.output.info(`EmmyLua (${emmylua.id}) ${emmylua.packageJSON.version} ${emmylua.isActive?"Activated":"Not Yet Activated"}`);

		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) {
			this.output.error(`No Workspace`);
			return;
		}

		try {
			const filecontent = (await fs.readFile(Utils.joinPath(workspaceLibrary, "emmylua/factorio/config.json"))).toString();
			const config = JSON.parse(filecontent);
			this.output.info(`Library bundle found in ${workspaceLibrary.fsPath}, generated from Factorio ${config.factorioVersion} with FMTK ${config.bundleVersion}`);

			for (const file of LuaLSAddon.getLuaFiles()) {
				try {
					const local = (await fs.readFile(Utils.joinPath(workspaceLibrary, "emmylua", file.name))).toString();
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

	}

	private async checkLuaLSConfig(luals: vscode.Extension<any>, activeVersion: ActiveFactorioVersion, factorioconfig: vscode.WorkspaceConfiguration) {
		this.output.info(`LuaLS (${luals.id}) ${luals.packageJSON.version} ${luals.isActive?"Activated":"Not Yet Activated"}`);

		const luaconfig = vscode.workspace.getConfiguration("Lua");

		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) {
			this.output.error(`No Workspace`);
			return;
		}

		try {
			const filecontent = (await fs.readFile(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/config.json"))).toString();
			const config = JSON.parse(filecontent);
			this.output.info(`Library bundle found in ${workspaceLibrary.fsPath}, generated from Factorio ${config.factorioVersion} with FMTK ${config.bundleVersion}`);

			for (const file of LuaLSAddon.getLuaFiles()) {
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

		const manageLibraryDataLinks = factorioconfig.get<boolean|null>("workspace.manageLibraryDataLinks");
		const library = luaconfig.get<string[]>("workspace.library");
		if (!library) {
			this.output.warn(`Lua.workspace.library not present!`);
		} else {
			const knownLibs:string[] = [];
			if (!activeVersion.onlineOnly) {
				const dataPath = URI.file(await activeVersion.dataPath()).fsPath;
				knownLibs.push(dataPath);
				if (library.includes(dataPath)) {
					this.output.info(`Lua.workspace.library: /data link OK (${dataPath})`);
				} else if (manageLibraryDataLinks) {
					this.output.warn(`Lua.workspace.library: /data link missing! (${dataPath})`);
				}
			}

			const workspaceLibPath = Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/library").fsPath;
			// luals sets this, so the slashes might be wrong. check more leniently, and use the found path later for exclusion
			const foundWorkspaceLibPath = library.find(l=>URI.file(l).fsPath === workspaceLibPath);
			if (foundWorkspaceLibPath) {
				knownLibs.push(foundWorkspaceLibPath);
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

			const otherLibs = library.filter(s=>!(knownLibs.includes(s)));
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
		const activeVersion = await this.getActiveVersion();
		if (activeVersion?.onlineOnly) {
			throw new Error("Select a local Factorio install to edit config");
		}
		return activeVersion?.disablePrototypeCache();
	}

	private async disableMouseAutoCaptureCommand() {
		const activeVersion = await this.getActiveVersion();
		if (activeVersion?.onlineOnly) {
			throw new Error("Select a local Factorio install to edit config");
		}
		return activeVersion?.disableMouseAutoCapture();
	}

	private async selectVersionCommand() {
		if (vscode.debug.activeDebugSession?.type==="factoriomod") {
			vscode.window.showErrorMessage("Cannot select Factorio version while debugging.");
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
				}))).filter((v)=>!!v);

		const describeVersion = async (fv:FactorioVersion)=>{
			if (fv.onlineDocs === true) {
				return "latest";
			}

			if (fv.onlineDocs) {
				return fv.onlineDocs;
			}

			return (await this.tryJsonDocs(fv).catch(()=>undefined))?.application_version ?? "unknown";
		};

		const qpresult = await vscode.window.showQuickPick([
			{
				kind: vscode.QuickPickItemKind.Separator,
				label: "settings",
			},
			...await Promise.all(versions.map(async fv=>({
				fv: fv,
				label: fv.name,
				description: await describeVersion(fv),
				detail: fv.factorioPath,
			}))),
			{
				kind: vscode.QuickPickItemKind.Separator,
				label: "autodetected",
			},
			...await Promise.all(detectedVersions.map(async fv=>({
				fv: fv,
				label: fv.name,
				description: await describeVersion(fv),
				detail: fv.factorioPath,
			}))),
			{
				fv: onlineLatest,
				label: onlineLatest.name,
				description: await describeVersion(onlineLatest),
			},
			{
				fv: onlineStable,
				label: onlineStable.name,
				description: await describeVersion(onlineStable),
			},
			{
				kind: vscode.QuickPickItemKind.Separator,
				label: "",
			},
			{
				fv: undefined,
				label: "Select another install locaton...",
				picked: false,
			},
		],
		{title: "Select Factorio Version"});
		if (!qpresult) { return; }

		let active_version = qpresult.fv;

		// check that the factorio binary referenced by qpresult.fv really still exists
		if (active_version?.factorioPath) {
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

		let add_to_settings = false;
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
				ignoreFocusOut: true,
			});
			if (!newName) { return; }

			active_version = {
				name: newName,
				factorioPath: factorioPath[0].fsPath,
			};
			add_to_settings = true;
		}

		// check for docs json
		let docs;
		try {
			docs = await this.tryJsonDocs(active_version);
		} catch (error) {
			if (!active_version.factorioPath) {
				vscode.window.showErrorMessage(`Unable to read online docs: ${error}`);
				return;
			}

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
				docs = await this.tryJsonDocs(active_version);
			} catch (error) {
				vscode.window.showErrorMessage(`Unable to read JSON docs: ${error}`);
				return;
			}
		}

		// mark selected as `active`
		await this.context.workspaceState.update("active_version", active_version);
		if (add_to_settings) {
			versions.push(active_version);
			config.update("versions", versions);
		}

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

	private async tryJsonDocs(fv:FactorioVersion) : Promise<ApiDocGenerator> {
		let docjson:string;
		if (fv.onlineDocs) {
			const version = (fv.onlineDocs === true || fv.onlineDocs === "throw" ) ? "latest" : fv.onlineDocs;

			const url = `https://lua-api.factorio.com/${version}/runtime-api.json`;
			const result = await fetch(url);
			if (!result.ok) {
				throw new Error(`Error fetching ${url} : ${result.statusText}`);
			}
			docjson = await result.text();
		} else {
			if (!fv.factorioPath) {
				throw new Error(`Invalid Config: requires at least one of factorioPath or onlineDocs in ${fv.name}`);
			}
			const docpath = Utils.joinPath(URI.file(substitutePathVariables(fv.factorioPath, vscode.workspace.workspaceFolders)),
				fv.docsPath ? fv.docsPath :
				(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
				"../../../doc-html/runtime-api.json"
			);
			// readFile can throw, let it...
			docjson = (await fs.readFile(docpath)).toString();
		}
		// doc gen might throw if invalid file, just let it...
		return new ApiDocGenerator(docjson);
	}


	private async wantsRegenFromConfigFileVersion(uri:vscode.Uri, activeVersion:ActiveFactorioVersion) {
		try {
			const filecontent = (await fs.readFile(uri)).toString();
			const config = JSON.parse(filecontent);
			if (config.factorioVersion !== activeVersion.docs.application_version ||
				config.bundleVersion !== bundleVersion) {
				// version tags mismatch, go ahead and regen...
				return true;
			}
			return false;
		} catch (error) {
			// no config.json at all
			return true;
		}
	}

	private async checkDocs() {
		const activeVersion = await this.getActiveVersion();
		if (!activeVersion) { return; }
		const workspaceLibrary = this.context.storageUri;
		if (!workspaceLibrary) { return; }

		let wantsRegen = false;

		const emmylua = emmylua_ids.some(id=>vscode.extensions.getExtension(id));
		if (emmylua) {
			wantsRegen ||= await this.wantsRegenFromConfigFileVersion(Utils.joinPath(workspaceLibrary, "emmylua/factorio/config.json"), activeVersion );
		}

		const sumneko = vscode.extensions.getExtension("sumneko.lua");
		if (sumneko) {
			wantsRegen ||= await this.wantsRegenFromConfigFileVersion(Utils.joinPath(workspaceLibrary, "sumneko-3rd/factorio/config.json"), activeVersion );
		}

		if (wantsRegen) {
			return this.generateDocs();
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

		const emmylua = emmylua_ids.map(id=>vscode.extensions.getExtension(id)).find(ex=>!!ex);
		if (emmylua) {
			this.output.appendLine(`Generating EmmyLua bundle for ${emmylua.id}`);
			const factorioconfig = vscode.workspace.getConfiguration("factorio");

			const emmylualib = Utils.joinPath(workspaceLibrary, "emmylua");

			await this.refreshDocFiles(emmylualib, activeVersion);

			const luarcs = await vscode.workspace.findFiles(".luarc.json");
			let jsontext = "{}";
			if (luarcs.length > 0) {
				jsontext = (await fs.readFile(luarcs[0])).toString();
			}

			const opts = { formattingOptions: {keepLines: true, insertFinalNewline: true, insertSpaces: true}};

			jsontext = applyEdits(jsontext, modify(jsontext, ["$schema"], "https://raw.githubusercontent.com/EmmyLuaLs/emmylua-analyzer-rust/refs/heads/main/crates/emmylua_code_analysis/resources/schema.json", opts));
			jsontext = applyEdits(jsontext, modify(jsontext, ["runtime", "version"], "Lua5.2", opts));
			jsontext = applyEdits(jsontext, modify(jsontext, ["runtime", "requirePattern"], ["?", "?.lua"], opts));
			const libpaths:(string|{path:string; ignoreDir?:string[]; ignoreGlobs?:string[]})[] = [ Utils.joinPath(emmylualib, "factorio", "library").fsPath ];
			if (factorioconfig.get<boolean|null>("workspace.manageLibraryDataLinks") !== false) {
				libpaths.push({
					path: await activeVersion.dataPath(),
					ignoreDir: [
						"core/lualib/event_handler.lua",
						"core/lualib/crash-site.lua",
						"core/lualib/math2d.lua",
						"core/lualib/meld.lua",
						"core/lualib/mod-gui.lua",
						"core/lualib/sound-util.lua",
						"core/lualib/util.lua",
						"core/lualib/silo-script.lua",
						"core/lualib/space-finish-script.lua",
						"core/lualib/prototype-info.lua",
						"core/lualib/circuit-connector-sprites.lua",
						"core/lualib/resource-autoplace.lua",
						"base/scripts/freeplay/",
						"base/scripts/pvp/",
						"base/scripts/sandbox/",
						"base/scripts/wave-defense/",
					],
					ignoreGlobs: [
						"*/migrations/**",
						"*/scenarios/**",
						"*/campaigns/**",
						"*/tutorials/**",
						"*/menu-simulations/**",
					],
				});
			}
			jsontext = applyEdits(jsontext, modify(jsontext, ["workspace", "library"], libpaths, opts));
			jsontext = applyEdits(jsontext, modify(jsontext, ["workspace", "moduleMap"], [
				{
					pattern: "^__(.*)__(.*)$",
					replace: "$1$2",
				},
				{
					pattern: "^(.*)\\.lua$",
					replace: "$1",
				},
			], opts));

			jsontext = applyEdits(jsontext, modify(jsontext, ["diagnostics", "disable"], ["unnecessary-if"], opts));;

			if (luarcs.length > 0) {
				await fs.writeFile(luarcs[0], Buffer.from(jsontext));
			} else {
				await fs.writeFile(Utils.joinPath(vscode.workspace.workspaceFolders![0].uri, ".luarc.json"), Buffer.from(jsontext));
			}

		}

		const sumneko = vscode.extensions.getExtension("sumneko.lua");
		if (sumneko) {
			this.output.appendLine(`Generating LuaLS bundle for ${sumneko.id}`);

			const sumneko3rd = Utils.joinPath(workspaceLibrary, "sumneko-3rd");

			await this.refreshDocFiles(sumneko3rd, activeVersion);

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

			if (previous_active && !previous_active.onlineOnly) {
				const oldroot = URI.file(await previous_active.dataPath());
				removeLibraryPath(oldroot);
			}

			if (library.length === 0) {
				await luaconfig.update("workspace.library", undefined);
			} else {
				await luaconfig.update("workspace.library", library);
			}

			if (factorioconfig.get<boolean|null>("workspace.manageLibraryDataLinks")) {
				const newroot = URI.file(await activeVersion.dataPath());
				await addLibraryPath(newroot);
			}

			if (library.length === 0) {
				await luaconfig.update("workspace.library", undefined);
			} else {
				await luaconfig.update("workspace.library", library);
			}

			let userThirdParty = luaconfig.get<string[]>("workspace.userThirdParty", []);


			// remove any mismatched entries and re-register the current one...
			userThirdParty = userThirdParty.filter(s=>{
				return !s.includes("justarandomgeek.factoriomod-debug");
			});
			// do the double-update on this to force luals to reload if we didn't actually change library links
			await luaconfig.update("workspace.userThirdParty", userThirdParty);
			userThirdParty.push(sumneko3rd.fsPath);
			await luaconfig.update("workspace.userThirdParty", userThirdParty);

			const checkThirdParty = luaconfig.get<string|undefined>("workspace.checkThirdParty");
			if (!(checkThirdParty && ["Ask", "Apply", "ApplyInMemory"].includes(checkThirdParty))) {
				await luaconfig.update("workspace.checkThirdParty", "ApplyInMemory");
			}

			if (!sumneko.isActive) {
				await sumneko.activate();
			}
		}
	}

	private async refreshDocFiles(basedir:URI, activeVersion:ActiveFactorioVersion) {
		await fs.createDirectory(basedir);

		try {
			await Promise.allSettled([
				fs.delete(Utils.joinPath(basedir, "factorio", "library"), {recursive: true}),
				fs.delete(Utils.joinPath(basedir, "factorio", "factorio-plugin"), {recursive: true}),
			]);
		} catch (error) {
		}

		const output = this.output;
		const docConfig = vscode.workspace.getConfiguration("factorio.docs");
		const docArgs = await activeVersion.docArgs(docConfig.get("usePrototypeDumps", false));
		const baseuri = docConfig.get<string>("docLinksBaseUri");
		if (baseuri) {
			docArgs.push("--docbase", baseuri);
		}
		const result = await forkScript(
			{ close() {}, write(data) { output.info(`docgen: ${data.trimEnd()}`); } },
			this.context.asAbsolutePath("./dist/fmtk-cli.js"), docArgs, basedir.fsPath);

		if (result !== 0) {
			this.output.warn(`docgen return code ${result}`);
			const action = await vscode.window.showErrorMessage("Error while generating docs", "Show Output");
			switch (action) {
				case "Show Output":
					this.output.show();
					break;

				default:
					break;
			}
			return;
		}
	}
}
