import * as vscode from 'vscode';
import { createReadStream, createWriteStream } from "fs";
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as Git from './git';
import * as semver from 'semver';
import archiver from 'archiver';
import { spawn } from 'child_process';
import { BufferSplitter } from './BufferSplitter';
import { ModManager } from './ModManager';
import FormData from 'form-data';
import fetch, { Headers } from 'node-fetch';
import { Keychain } from './Keychain';
interface ModPackageScripts {
	compile?: string
	datestamp?: string
	prepackage?: string
	version?: string
	prepublish?: string
	publish?: string
	postpublish?: string
};

export interface ModInfo {
	// actual Factorio fields:
	name: string
	version: string
	factorio_version: string
	title: string
	author: string
	homepage: string
	contact: string
	description: string
	dependencies: string[]

	// my extensions for packaging:
	package?: {
		ignore?: string[]
		no_git_push?: boolean
		no_git_tag?: boolean
		git_publish_branch?: string|null
		no_portal_upload?: boolean
		scripts?: ModPackageScripts
	}
};

interface AdjustModsDefinition extends vscode.TaskDefinition {
	type: "factorio"
	command: "adjustMods"
	adjustMods: {[keys:string]:string|boolean}
	modsPath: string
	disableExtraMods?:boolean
	allowDisableBaseMod?:boolean
}

interface PortalError {
	error:"InvalidApiKey"|"InvalidRequest"|"InternalError"|"Forbidden"|"Unknown"|"InvalidModRelease"|"InvalidModUpload"|"UnknownMod"
	message:string
}

export async function activateModPackageProvider(context:vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		const keychain = new Keychain(context.secrets);
		context.subscriptions.push(vscode.commands.registerCommand("factorio.clearApiKey", async ()=>{
			await keychain.ClearApiKey();
		}));
		const treeDataProvider = new ModsTreeDataProvider(keychain);
		context.subscriptions.push(treeDataProvider);
		const view = vscode.window.createTreeView('factoriomods', { treeDataProvider: treeDataProvider });
		context.subscriptions.push(view);
		await MigrateAPIKeyStorage(keychain);
	}
}

async function MigrateAPIKeyStorage(keychain:Keychain) {

	const config = vscode.workspace.getConfiguration("factorio.portal");
	const key = config.inspect<string>("apikey");
	if (key) {
		const global = key.globalValue;
		const workspace = key.workspaceValue;
		if (global && workspace) {
			if (global !== workspace) {
				switch (await vscode.window.showInformationMessage(
					"Factorio Mod Portal API Key is present in both Workspace and Global configuration. Which would you like migrated to secure storage?",
					"Global", "Workspace"
				)) {
					case 'Global':
						await Promise.all([
							keychain.SetApiKey(global),
							config.update("apikey", undefined, true),
							config.update("apikey", undefined, false),
						]);
						break;
					case 'Workspace':
						await Promise.all([
							keychain.SetApiKey(workspace),
							config.update("apikey", undefined, true),
							config.update("apikey", undefined, false),
						]);
						break;
					default:
						break;
				}
			} else {
				// they're the same, it doesn't matter which...
				await Promise.all([
					keychain.SetApiKey(workspace),
					config.update("apikey", undefined, true),
					config.update("apikey", undefined, false),
				]);
			}
		} else if (global) {
			await Promise.all([
				keychain.SetApiKey(global),
				config.update("apikey", undefined, true),
			]);
		} else if (workspace) {
			await Promise.all([
				keychain.SetApiKey(workspace),
				config.update("apikey", undefined, false),
			]);
		}
	}
}

class ModTaskProvider implements vscode.TaskProvider {
	constructor(private readonly modPackages: Map<string, ModPackage>) {}


	provideTasks(token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task[]> {
		const tasks:vscode.Task[] = [];

		const latest = ModPackage.latestPackages(this.modPackages.values());
		for (const modpackage of this.modPackages.values()) {
			if (!latest.has(modpackage)) { continue; }
			if (modpackage.scripts?.compile) {
				tasks.push(new vscode.Task(
					{label: `${modpackage.label}.compile`, type: "factorio", modname: modpackage.label, command: "compile"},
					vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
					`${modpackage.label}.compile`,
					"factorio",
					modpackage.CompileTask(),
					[]
				));
			}
			tasks.push(new vscode.Task(
				{label: `${modpackage.label}.datestamp`, type: "factorio", modname: modpackage.label, command: "datestamp"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.datestamp`,
				"factorio",
				modpackage.DateStampTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.label}.package`, type: "factorio", modname: modpackage.label, command: "package"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.package`,
				"factorio",
				modpackage.PackageTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.label}.version`, type: "factorio", modname: modpackage.label, command: "version"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.version`,
				"factorio",
				modpackage.IncrementTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.label}.upload`, type: "factorio", modname: modpackage.label, command: "upload"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.upload`,
				"factorio",
				modpackage.PostToPortalTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.label}.publish`, type: "factorio", modname: modpackage.label, command: "publish"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.publish`,
				"factorio",
				modpackage.PublishTask(),
				[]
			));
		};

		return tasks;
	}

	resolveTask(task: vscode.Task, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task> {
		if (task.definition.type === "factorio") {
			let execution:vscode.CustomExecution|undefined;
			if (task.definition.command === "adjustMods") {
				if (!task.definition.adjustMods) {
					execution = this.ConfigErrorTask(task.definition, "missing `adjustMods`");
				} else if (!task.definition.modsPath) {
					execution = this.ConfigErrorTask(task.definition, "missing `modsPath`");
				} else {
					execution = this.AdjustModsTask(<AdjustModsDefinition>task.definition);
				}
			} else {
				if (!task.definition.modname) {
					execution = this.ConfigErrorTask(task.definition, "missing `modname`");
				} else {
					const latest = ModPackage.latestPackages(this.modPackages.values());
					for (const modpackage of this.modPackages.values()) {
						if (modpackage.label === task.definition.modname && latest.has(modpackage)) {
							const mp = modpackage;
							switch (task.definition.command) {
								case "compile":
									execution = mp.CompileTask();
									break;
								case "datestamp":
									execution = mp.DateStampTask();
									break;
								case "package":
									execution = mp.PackageTask();
									break;
								case "version":
									execution = mp.IncrementTask();
									break;
								case "upload":
									execution = mp.PostToPortalTask();
									break;
								case "publish":
									execution = mp.PublishTask();
									break;
								default:
									execution = this.ConfigErrorTask(task.definition, `unknown \`command\` "${task.definition.command}"`);
							}
							break;
						}
					}
					if (!execution) {
						execution = this.ConfigErrorTask(task.definition, `mod "${task.definition.modname}" not found`);
					}
				}
			}
			return new vscode.Task(
				task.definition,
				task.scope || vscode.TaskScope.Workspace,
				task.name,
				task.source,
				execution,
				[]);
		}
		return undefined;
	}

	private async ConfigError(term:ModTaskTerminal, def:vscode.TaskDefinition, error:string): Promise<void> {
		term.write(error+"\n");
		term.write(JSON.stringify(def, undefined, 2));
	}

	private ConfigErrorTask(def:vscode.TaskDefinition, error:string): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.ConfigError(term, def, error);
				term.close();
			});
		});
	}

	private async AdjustMods(term:ModTaskTerminal, def:AdjustModsDefinition): Promise<void> {
		def.modsPath = def.modsPath.replace(/\\/g, "/");
		term.write(`Using modsPath ${def.modsPath}\n`);
		const manager = new ModManager(def.modsPath);
		await manager.Loaded;
		if (!def.allowDisableBaseMod) { def.adjustMods["base"] = true; }
		if (def.disableExtraMods) {
			term.write(`All Mods disabled\n`);
			manager.disableAll();
		}
		for (const mod in def.adjustMods) {
			if (def.adjustMods.hasOwnProperty(mod)) {
				const adjust = def.adjustMods[mod];
				manager.set(mod, adjust);
				term.write(`${mod} ${
					adjust === true ? "enabled" :
					adjust === false ? "disabled" :
					"enabled version " + adjust
				}\n`);
			}
		}
		try {
			await manager.write();
		} catch (error) {
			term.write(`Failed to save mod list:\n${error}\n`);
		}
	}

	private AdjustModsTask(def:AdjustModsDefinition): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.AdjustMods(term, def);
				term.close();
			});
		});
	}
}

class ModPackage extends vscode.TreeItem {
	public label: string; // used as modname
	public description: string; // used as modversion
	public packageIgnore?: string[];
	public noGitPush?: boolean;
	public noGitTag?: boolean;
	public gitPublishBranch?: string|null;
	public noPortalUpload?: boolean;
	public scripts?: ModPackageScripts;

	constructor(
		public readonly resourceUri: vscode.Uri,
		modscript: ModInfo,
		private readonly keychain: Keychain
	) {
		super(resourceUri);
		this.label = modscript.name;
		this.description = modscript.version;
		this.tooltip = modscript.title;
		this.command = {
			title: 'Open',
			command: 'vscode.open',
			arguments: [resourceUri],
		};
		//this.id = modscript.name;
		this.packageIgnore = modscript.package?.ignore;
		this.noGitPush = modscript.package?.no_git_push;
		this.noGitTag = modscript.package?.no_git_tag;
		this.gitPublishBranch = modscript.package?.git_publish_branch;
		this.noPortalUpload = modscript.package?.no_portal_upload;
		this.scripts = modscript.package?.scripts;
	}

	public static sort(a:ModPackage, b:ModPackage) {
		const namecomp = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
		if (namecomp !== 0) { return namecomp * 100; }

		const vercomp = semver.compare(a.description, b.description, {"loose": true});
		if (vercomp !== 0) { return -vercomp * 10; }

		if (a.resourceUri<b.resourceUri) { return -1; }
		if (a.resourceUri>b.resourceUri) { return  1; }

		return 0;
	}

	public static latestPackages(packages:IterableIterator<ModPackage>) {
		const byModName = new Map<string, ModPackage[]>();
		for (const mp of packages) {
			if (byModName.has(mp.label)) {
				byModName.get(mp.label)!.push(mp);
			} else {
				byModName.set(mp.label, [mp]);
			}
		}
		const latest = new Set<ModPackage>();
		for (const mps of byModName.values()) {
			latest.add(mps.reduce((a, b)=>(semver.compare(a.description, b.description, {"loose": true}) < 0) ? b : a));
		}
		return latest;
	}

	public async Update() {
		const infodoc = await vscode.workspace.openTextDocument(this.resourceUri);
		const jsonstr = infodoc.getText();
		const modscript: ModInfo = JSON.parse(jsonstr);

		this.label = modscript.name;
		this.description = modscript.version;
		this.tooltip = modscript.title;
		this.packageIgnore = modscript.package?.ignore;
		this.noGitPush = modscript.package?.no_git_push;
		this.gitPublishBranch = modscript.package?.git_publish_branch;
		this.noPortalUpload = modscript.package?.no_portal_upload;
		this.scripts = modscript.package?.scripts;
	}

	private async Compile(term:ModTaskTerminal): Promise<void> {
		const moddir = path.dirname(this.resourceUri.fsPath);
		if (this.scripts?.compile) {
			term.write(`Compiling: ${this.resourceUri} ${this.description}\r\n`);

			const code = await runScript(term, "compile", this.scripts.compile, moddir,
				{ FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: this.description });
			if (code !== 0) { return; }
		}
	}

	public CompileTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				await this.Compile(term);
				term.close();
			});
		});
	}

	private async DateStampChangelog(term:ModTaskTerminal): Promise<boolean|number> {
		const moddir = path.dirname(this.resourceUri.fsPath);
		const changelogpath = path.join(moddir, "changelog.txt");
		try {
			await fsp.access(changelogpath);
			//datestamp current section
			const changelogdoc = await vscode.workspace.openTextDocument(changelogpath);
			const syms = <vscode.DocumentSymbol[]> await vscode.commands.executeCommand<(vscode.SymbolInformation|vscode.DocumentSymbol)[]>("vscode.executeDocumentSymbolProvider", changelogdoc.uri);
			const current = syms?.find(sym=>sym.name.startsWith(this.description))!;
			if (current) {
				const date = current.children.find(sym=>sym.name === "Date");
				const we = new vscode.WorkspaceEdit();
				if (date) {
					we.replace(changelogdoc.uri, date.selectionRange, new Date().toISOString().substr(0, 10));
				} else {
					we.insert(changelogdoc.uri, current.selectionRange.end, `\nDate: ${new Date().toISOString().substr(0, 10)}`);
				}
				await vscode.workspace.applyEdit(we);
				await changelogdoc.save();
				term.write(`Changelog section ${this.description} stamped ${new Date().toISOString().substr(0, 10)}\r\n`);
			} else {
				term.write(`No Changelog section for ${this.description}\r\n`);
			}
			if (this.scripts?.datestamp) {
				const code = await runScript(term, "datestamp", this.scripts.datestamp, moddir,
					{ FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: this.description });
				if (code !== 0) { return code; }
			}
			return true;
		} catch (error) {
			term.write(`No Changelog found\r\n`);
			if (this.scripts?.datestamp) {
				const code = await runScript(term, "datestamp", this.scripts.datestamp, moddir,
					{ FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: this.description });
				if (code !== 0) { return code; }
			}
			return false;
		}
	}

	public DateStampTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				await this.DateStampChangelog(term);
				term.close();
			});
		});
	}

	public static async BuildZip(moddir:string, packagepath:string, ignore:string[], name:string, version:string): Promise<number> {
		const zipoutput = createWriteStream(packagepath);
		const archive = archiver('zip', { zlib: { level: 9 }});
		archive.pipe(zipoutput);
		archive.glob("**", { cwd: moddir, root: moddir, nodir: true, ignore: ignore }, { prefix: `${name}_${version}` });
		const bytesWritten = new Promise<number>((resolve, reject)=>{
			zipoutput.on("close", ()=>resolve(archive.pointer()));
			archive.finalize();
		});
		return bytesWritten;
	}

	private async Package(term:ModTaskTerminal): Promise<string|undefined> {
		const config = vscode.workspace.getConfiguration(undefined, this.resourceUri);

		term.write(`Packaging: ${this.resourceUri} ${this.description}\r\n`);
		await this.Compile(term);
		const moddir = path.dirname(this.resourceUri.fsPath);
		if (this.scripts?.prepackage) {
			const code = await runScript(term, "prepackage", this.scripts.prepackage, moddir,
				{ FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: this.description });
			if (code !== 0) { return; }
		}
		let packagebase = moddir;
		switch (config.get<string>("factorio.package.zipLocation", "inside")) {
			case "outside":
				packagebase = path.dirname(moddir);
				break;
			case "inside":
			default:
				break;
		}

		const packagepath = path.join(packagebase, `${this.label}_${this.description}.zip`);

		const ignore = [`**/${this.label}_*.zip`].concat(this.packageIgnore||[]);
		const bytesWritten = await ModPackage.BuildZip(moddir, packagepath, ignore, this.label, this.description);
		term.write(`Built ${this.label}_${this.description}.zip ${bytesWritten} bytes\r\n`);
		return packagepath;
	}

	public PackageTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				await this.Package(term);
				term.close();
			});
		});
	}


	private async IncrementVersion(term:ModTaskTerminal): Promise<string|undefined> {
		const we = new vscode.WorkspaceEdit();
		// increment info.json version
		const infodoc = await vscode.workspace.openTextDocument(this.resourceUri);
		const syms = await vscode.commands.executeCommand<(vscode.SymbolInformation|vscode.DocumentSymbol)[]>
			("vscode.executeDocumentSymbolProvider", this.resourceUri);

		if (!syms) {
			term.write(`Error: Unable to load document symbols for ${this.resourceUri}\r\n`);
			return;
		}

		const newversion = semver.inc(this.description, 'patch', {"loose": true})!;
		const version = syms.find(sym=>sym.name === "version")!;

		we.replace(this.resourceUri,
			version instanceof vscode.SymbolInformation ? version.location.range : version.selectionRange,
			`"version": "${newversion}"`);

		const moddir = path.dirname(this.resourceUri.fsPath);
		const changelogpath = path.join(moddir, "changelog.txt");
		let changelogdoc: vscode.TextDocument|undefined;
		try {
			await fsp.access(changelogpath);
			//datestamp current section
			changelogdoc = await vscode.workspace.openTextDocument(changelogpath);
			//insert new section
			we.insert(changelogdoc.uri, new vscode.Position(0, 0),
				"---------------------------------------------------------------------------------------------------\n" +
			`Version: ${newversion}\n` +
			"Date: ????\n" +
			"  Changes:\n"
			// no placeholder line because prefix alone is not valid...
			);
		} catch (error) {}
		await vscode.workspace.applyEdit(we);
		await infodoc.save();
		// eslint-disable-next-line no-unused-expressions
		changelogdoc && await changelogdoc.save();
		term.write(`Moved version to ${newversion}\r\n`);
		if (this.scripts?.version) {
			await runScript(term, "version", this.scripts.version, moddir,
				{ FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: newversion });
		}
		return newversion;
	}

	public IncrementTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				await this.IncrementVersion(term);
				term.close();
			});
		});
	}

	private async PostToPortal(packagepath: string, packageversion:string, term:ModTaskTerminal): Promise<boolean> {
		try {
			const APIKey = await this.keychain.GetAPIKey();
			if (!APIKey) { return false; }

			const headers = new Headers({
				"Authorization": `Bearer ${APIKey}`,
			});
			term.write(`Uploading to mod portal...\r\n`);
			const init_form = new FormData();
			init_form.append("mod", this.label);
			const init_result = await fetch("https://mods.factorio.com/api/v2/mods/releases/init_upload", {
				method: "POST",
				body: init_form,
				headers: headers,
			});
			if (!init_result.ok) {
				term.write(`init_upload failed: ${init_result.status} ${init_result.statusText}'\r\n`);
				return false;
			}
			const init_json = <{upload_url:string}|PortalError> await init_result.json();

			if ('error' in init_json) {
				if (init_json.error === "InvalidApiKey") {
					this.keychain.ClearApiKey();
				}
				term.write(`init_upload failed: ${init_json.error} ${init_json.message}'\r\n`);
				return false;
			}

			const finish_form = new FormData();
			finish_form.append(
				"file",
				createReadStream(packagepath),
				{
					filename: `${this.label}_${packageversion}.zip`,
					contentType: 'application/x-zip-compressed',
				});
			const finish_result = await fetch(init_json.upload_url, {
				method: "POST",
				body: finish_form,
				headers: headers,
			});
			if (!finish_result.ok) {
				term.write(`finish_upload failed: ${finish_result.status} ${finish_result.statusText}'\r\n`);
				return false;
			}
			const finish_json = <{success:true}|PortalError> await finish_result.json();
			if ('error' in finish_json) {
				term.write(`finish_upload failed: ${finish_json.error} ${finish_json.message}'\r\n`);
				return false;
			}
			term.write(`Published ${this.label} version ${packageversion}`);
			return true;
		} catch (error) {
			term.write(`Error while uploading mod: ${error}'\r\n`);
			return false;
		}
	}

	public PostToPortalTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				const config = vscode.workspace.getConfiguration(undefined, this.resourceUri);
				let packagebase = path.dirname(this.resourceUri.path);
				switch (config.get<string>("factorio.package.zipLocation", "inside")) {
					case "outside":
						packagebase = path.dirname(packagebase);
						break;
					case "inside":
					default:
						break;
				}
				const moddir = this.resourceUri.with({path: packagebase});
				const direntries = await vscode.workspace.fs.readDirectory(moddir);
				const packages = direntries.filter(([name, type])=>{
					return type === vscode.FileType.File && name.startsWith(this.label) && name.match(/_\d+\.\d+\.\d+\.zip$/);
				}).map(([name, type])=>{ return name; }).sort().reverse();
				const packagename = await vscode.window.showQuickPick(packages, { placeHolder: "Select Package to upload" });
				if (!packagename) {
					term.close();
					return;
				}
				const packagepath = path.join(moddir.fsPath, packagename);
				const packageversion = packagename.match(/_([0-9.]+)\.zip/)![1];
				await this.PostToPortal(packagepath, packageversion, term);
				term.close();
			});
		});
	}

	private async Publish(term:ModTaskTerminal) {
		term.write(`Publishing: ${this.resourceUri} ${this.description}\r\n`);
		const moddir = path.dirname(this.resourceUri.fsPath);
		const gitExtension = vscode.extensions.getExtension<Git.GitExtension>('vscode.git')!.exports;
		const git = gitExtension.getAPI(1);
		const repo = git.getRepository(this.resourceUri);
		const config = vscode.workspace.getConfiguration(undefined, this.resourceUri);

		const packageversion = this.description;
		let branchname:string|null;
		if (repo) {
			// throw if uncommitted changes
			if (repo.state.workingTreeChanges.length > 0) {
				term.write("Cannot Publish with uncommitted changes\r\n");
				return;
			}
			branchname =
				(this.gitPublishBranch !== undefined)?
					this.gitPublishBranch:
					config.get<string|null>("factorio.package.defaultPublishBranch", "master");

			if (branchname === null) {
				branchname = repo.state.HEAD?.name!;
			} else {
				// throw if not on publish branch
				if (repo.state.HEAD?.name !== branchname) {
					term.write(`Cannot Publish on branch other than '${branchname}'\r\n`);
					return;
				}
			}
		} else {
			term.write("No git repo found\r\n");
		}

		if (this.scripts?.prepublish) {
			const code = await runScript(term, "prepublish", this.scripts.prepublish, moddir, { FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: packageversion });
			if (code !== 0) { return; }
		}

		const haschangelog = await this.DateStampChangelog(term);
		if (typeof haschangelog === "number") { return; }

		let tagname:string|undefined;
		if (repo) {
			if (haschangelog) { await runScript(term, undefined, `git add changelog.txt`, moddir); }
			await runScript(term, undefined,
				`git commit --author "${ config.get<string>("factorio.package.autoCommitAuthor")! }" --allow-empty -F -`,
				moddir, undefined,
				config.get<string>("factorio.package.preparingCommitMessage")!.replace(/\$VERSION/g, packageversion).replace(/\$MODNAME/g, this.label));

			if (!this.noGitTag) {
				tagname = config.get<string>("factorio.package.tagName", "$VERSION");
				tagname = tagname.replace(/\$VERSION/g, packageversion).replace(/\$MODNAME/g, this.label);
				if (config.get<boolean>("factorio.package.tagVPrefix")) {
					term.write(`Using deprecated option factorio.package.tagVPrefix. Use factorio.package.tagName instead. \r\n`);
					tagname = "v" + tagname;
				}
				let tagmessage = config.get<string>("factorio.package.tagMessage");
				tagmessage = tagmessage?.replace(/\$VERSION/g, packageversion).replace(/\$MODNAME/g, this.label);
				await runScript(term, undefined, `git tag -a ${tagname} -F -`, moddir, undefined, tagmessage);
			}
		}

		// build zip with <factorio.package>
		const packagepath = await this.Package(term);
		if (!packagepath) { return; }

		const newversion = await this.IncrementVersion(term);
		if (!newversion) { return; }

		if (this.scripts?.publish) {
			const code = await runScript(term, "publish", this.scripts.publish, moddir, { FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: packageversion });
			if (code !== 0) { return; }
		}

		if (repo) {
			await runScript(term, undefined, `git add info.json`, moddir);
			if (haschangelog) { await runScript(term, undefined, `git add changelog.txt`, moddir); }
			await runScript(term, undefined,
				`git commit --author "${ config.get<string>("factorio.package.autoCommitAuthor")! }" -F -`,
				moddir, undefined,
				config.get<string>("factorio.package.movedToCommitMessage")!.replace(/\$VERSION/g, newversion).replace(/\$MODNAME/g, this.label));


			if (!this.noGitPush) {
				const upstream = repo?.state.HEAD?.upstream;
				if (upstream) {
					await runScript(term, undefined, `git push ${upstream.remote} ${branchname!} ${tagname ?? ""}`, moddir);
				} else {
					term.write(`no remote set as upstream on ${branchname!}\r\n`);
				}
			}
		}
		if (!this.noPortalUpload && ! await this.PostToPortal(packagepath, packageversion, term)) {
			return;
		}

		if (this.scripts?.postpublish) {
			const code = await runScript(term, "postpublish", this.scripts.postpublish, moddir, { FACTORIO_MODNAME: this.label, FACTORIO_MODVERSION: packageversion, FACTORIO_MODPACKAGE: packagepath });
			if (code !== 0) { return; }
		}
		if (config.get<boolean>("factorio.package.removeZipAfterPublish", false)) {
			await fsp.unlink(packagepath);
		}
	}

	public PublishTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await this.Update();
				await this.Publish(term);
				term.close();
			});
		});
	}
}
class ModsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

	private readonly modPackages: Map<string, ModPackage>;
	private readonly subscriptions:{dispose():void}[] = [this._onDidChangeTreeData];
	constructor(private readonly keychain:Keychain) {
		this.modPackages = new Map<string, ModPackage>();
		vscode.workspace.findFiles('**/info.json').then(infos=>{ infos.forEach(this.updateInfoJson, this); });
		const infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		this.subscriptions.push(infoWatcher.onDidChange(this.updateInfoJson, this));
		this.subscriptions.push(infoWatcher.onDidCreate(this.updateInfoJson, this));
		this.subscriptions.push(infoWatcher.onDidDelete(this.removeInfoJson, this));
		this.subscriptions.push(infoWatcher);

		this.subscriptions.push(vscode.tasks.registerTaskProvider("factorio", new ModTaskProvider(this.modPackages)));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.openchangelog",
				async (mp:ModPackage)=>vscode.window.showTextDocument(vscode.Uri.joinPath(mp.resourceUri, "../changelog.txt"))
			));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.compile", async (mp:ModPackage)=>{
				const compiletask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command = "compile" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(compiletask);
			}));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.datestamp", async (mp:ModPackage)=>{
				const datestamptask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command = "datestamp" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(datestamptask);
			}));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.package", async (mp:ModPackage)=>{
				const packagetask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "package" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(packagetask);
			}));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.version", async (mp:ModPackage)=>{
				const versiontask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "version" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(versiontask);
			}));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.upload", async (mp:ModPackage)=>{
				const uploadtask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "upload" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(uploadtask);
			}));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.publish", async (mp:ModPackage)=>{
				const publishtask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "publish" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(publishtask);

			}));
	}

	dispose() {
		this.subscriptions.forEach(d=>d.dispose());
	}

	private async updateInfoJson(uri: vscode.Uri) {
		if (uri.scheme === "file") {
			const infodoc = await vscode.workspace.openTextDocument(uri);
			const jsonstr = infodoc.getText();
			if (jsonstr) {
				const modscript: ModInfo = JSON.parse(jsonstr);
				if (modscript && modscript.name) {
					if (this.modPackages.has(uri.toString())) {
						await this.modPackages.get(uri.toString())?.Update();
					} else {
						this.modPackages.set(uri.toString(), new ModPackage(uri, modscript, this.keychain));
					}
				} else {
					this.modPackages.delete(uri.toString());
				}
			} else {
				this.modPackages.delete(uri.toString());
			}
		} else {
			this.modPackages.delete(uri.toString());
		}
		this._onDidChangeTreeData.fire(undefined);
	}
	private async removeInfoJson(uri: vscode.Uri) {
		this.modPackages.delete(uri.toString());
		this._onDidChangeTreeData.fire(undefined);
	}
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	async getChildren(element?: vscode.TreeItem | undefined): Promise<vscode.TreeItem[]> {
		if (!element) {
			const items: vscode.TreeItem[] = [];
			if (this.modPackages) {
				const latest = ModPackage.latestPackages(this.modPackages.values());
				for (const modscript of this.modPackages.values()) {
					if (latest.has(modscript)) {
						items.push(modscript);
						const context = ["latest"];
						if (modscript.scripts?.compile) {
							context.push("hascompile");
						}
						try {
							await vscode.workspace.fs.stat(vscode.Uri.joinPath(modscript.resourceUri, "../changelog.txt"));
							context.push("haschangelog");
						} catch (error) {}

						modscript.contextValue = context.join(" ");
						modscript.collapsibleState = (()=>{
							for (const other of this.modPackages.values()) {
								if (modscript.label === other.label && !latest.has(other)) {
									return vscode.TreeItemCollapsibleState.Collapsed;
								}
							}
							return vscode.TreeItemCollapsibleState.None;
						})();
					}
				}
			}
			return (items as ModPackage[]).sort(ModPackage.sort);
		} else if (element instanceof ModPackage) {
			const items: vscode.TreeItem[] = [];
			if (this.modPackages) {
				const latest = ModPackage.latestPackages(this.modPackages.values());
				if (latest.has(element)) {
					this.modPackages.forEach((modscript, uri)=>{
						if (modscript.label === element.label && !latest.has(modscript)) {
							items.push(modscript);
							modscript.contextValue = "older";
						}
					});
				}
			}
			return (items as ModPackage[]).sort(ModPackage.sort);
		} else {
			return [];
		}
	}
}

interface ModTaskTerminal {
	write(data:string):void
	close():void
}

async function runScript(term:ModTaskTerminal, name:string|undefined, command:string, cwd:string, env?:NodeJS.ProcessEnv, stdin?:string): Promise<number> {
	const config = vscode.workspace.getConfiguration(undefined, vscode.Uri.parse(cwd) );
	let configenv: Object | undefined;
	let configshell: string | undefined;
	let configautoshell: string | undefined;
	switch (os.platform()) {
		case "win32":
			configenv = config.get<Object>("terminal.integrated.env.windows");
			configshell = config.get<string>("terminal.integrated.shell.windows");
			configautoshell = config.get<string>("terminal.integrated.automationShell.windows");
			break;
		case "darwin":
			configenv = config.get<Object>("terminal.integrated.env.osx");
			configshell = config.get<string>("terminal.integrated.shell.osx");
			configautoshell = config.get<string>("terminal.integrated.automationShell.osx");
			break;
		default:
			configenv = config.get<Object>("terminal.integrated.env.linux");
			configshell = config.get<string>("terminal.integrated.shell.linux");
			configautoshell = config.get<string>("terminal.integrated.automationShell.linux");
			break;
	}

	const scriptenv = Object.assign({}, process.env, configenv, env || {} );

	return new Promise((resolve, reject)=>{
		if (name) {
			term.write(`>> Running mod script "${name}": ${command} <<\r\n`);
		} else {
			term.write(`${command}\r\n`);
		}

		const scriptProc = spawn(command, {
			cwd: cwd,
			env: scriptenv,
			shell: configautoshell ?? configshell ?? true,
			stdio: "pipe",
		});

		const stdout = new BufferSplitter(scriptProc.stdout, Buffer.from("\n"));
		stdout.on("segment", (chunk:Buffer)=>{
			term.write(chunk.toString()+"\r\n");
		});
		const stderr = new BufferSplitter(scriptProc.stderr, Buffer.from("\n"));
		stderr.on("segment", (chunk:Buffer)=>{
			term.write(chunk.toString()+"\r\n");
		});
		scriptProc.on('close', (code, signal)=>{
			if (name) {
				term.write(`>> Mod script "${name}" returned ${code} <<\r\n`);
			}
			resolve(code ?? -1);
		});

		scriptProc.on("error", (error)=>{
			if (name) {
				term.write(`>> Mod script "${name}" failed: ${error.message} <<\r\n`);
			} else {
				term.write(`${error.message}\r\n`);
			}
		});

		if (stdin) {
			scriptProc.stdin.write(stdin);
		}
		scriptProc.stdin.end();
	});

}

class ModTaskPseudoterminal implements vscode.Pseudoterminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private readonly closeEmitter = new vscode.EventEmitter<void>();
	onDidClose?: vscode.Event<void> = this.closeEmitter.event;
	private readonly tokensource = new vscode.CancellationTokenSource();

	constructor(private readonly runner:(term:ModTaskTerminal, token?:vscode.CancellationToken)=>void|Promise<void>) {}

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		const writeEmitter = this.writeEmitter;
		const closeEmitter = this.closeEmitter;
		await this.runner({
			write: (data)=>writeEmitter.fire(data.replace(/\r?\n/g, "\r\n")),
			close: ()=>closeEmitter.fire(),
		}, this.tokensource.token);
		closeEmitter.fire();
	}

	close(): void {
		this.tokensource.cancel();
	}
}
