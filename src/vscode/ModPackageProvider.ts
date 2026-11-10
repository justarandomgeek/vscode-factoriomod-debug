/* eslint-disable @typescript-eslint/require-await */
import * as vscode from 'vscode';
import * as path from 'path';
import { fork } from 'child_process';
import { BufferSplitter } from '../Util/BufferSplitter';
import { Keychain } from './Keychain';
import { platform, tmpdir } from 'os';
import { default as dotize } from "dotize";
import type { GitExtension, API as GitAPI } from './git';
import * as FactorioTestController from "./FactorioTestController";
import type { FactorioVersionSelector } from './VersionSelector';
import type { TestSpec, WildcardTestSpec } from '../Test/TestSpec';
import type { ModInfo} from './ModPackage';
import { ModPackage } from './ModPackage';
import type { ModTaskTerminal } from './ModTaskPseudoterminal';
import { ModTaskPseudoterminal } from './ModTaskPseudoterminal';

interface AdjustModsDefinition extends vscode.TaskDefinition {
	type: "factorio"
	command: "adjustMods"
	adjustMods: {[keys:string]:string|boolean}
	modsPath: string
	disableExtraMods?:boolean
	allowDisableBaseMod?:boolean
}

let extensionUri:vscode.Uri;
function addBinToPath(path:string) {
	if (extensionUri) {
		switch (platform()) {
			case 'win32':
				return `${path};${vscode.Uri.joinPath(extensionUri, "bin").fsPath}`;
			default:
				return `${path}:${vscode.Uri.joinPath(extensionUri, "bin").fsPath}`;
		}
	}
	return path;
}

export async function activateModPackageProvider(context:vscode.ExtensionContext, versionSelector:FactorioVersionSelector) {
	if (vscode.workspace.workspaceFolders) {
		const keychain = new Keychain(context.secrets);
		context.subscriptions.push(vscode.commands.registerCommand("factorio.clearApiKey", async ()=>{
			await keychain.ClearApiKey();
		}));
		context.subscriptions.push(vscode.commands.registerCommand("factorio.setApiKey", async ()=>{
			await keychain.ReadyAPIKey(true);
		}));
		const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
		if (gitExtension && !gitExtension.isActive) {
			await gitExtension.activate();
		}
		const packageProvider = new ModPackageProvider(context, keychain, gitExtension?.exports.getAPI(1));
		context.subscriptions.push(packageProvider);
		const view = vscode.window.createTreeView('factoriomods', { treeDataProvider: packageProvider });
		context.subscriptions.push(view);
		extensionUri = context.extensionUri;

		FactorioTestController.activate(context, packageProvider, versionSelector);
	}
}

export class ModPackageProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TaskProvider, vscode.Disposable {
	private readonly context:vscode.ExtensionContext;
	private readonly keychain:Keychain;
	private readonly gitapi?:GitAPI;

	private readonly _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

	private readonly modPackages: Map<string, ModPackage>;
	private readonly subscriptions:{dispose():void}[] = [this._onDidChangeTreeData];

	constructor(context:vscode.ExtensionContext, keychain:Keychain, gitapi?:GitAPI) {
		this.context = context;
		this.keychain = keychain;
		this.gitapi = gitapi;
		this.modPackages = new Map<string, ModPackage>();
		vscode.workspace.findFiles('**/info.json').then(infos=>{ infos.forEach((uri)=>void this.updateInfoJson(uri)); });
		const infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		this.subscriptions.push(infoWatcher.onDidChange((uri)=>this.updateInfoJson(uri)));
		this.subscriptions.push(infoWatcher.onDidCreate((uri)=>this.updateInfoJson(uri)));
		this.subscriptions.push(infoWatcher.onDidDelete((uri)=>this.removeInfoJson(uri)));
		this.subscriptions.push(infoWatcher);

		if (gitapi) {
			this.subscriptions.push(gitapi.onDidOpenRepository(async (repo)=>{
				for (const modscript of this.modPackages.values()) {
					const modrepo = gitapi.getRepository(modscript.resourceUri);
					if (repo.rootUri.toString() === modrepo?.rootUri?.toString()) {
						await modscript.ReloadInfo();
						this.subscriptions.push(repo.onDidCommit(async ()=>{
							await modscript.ReloadInfo();
						}));
						this.subscriptions.push(repo.onDidCheckout(async ()=>{
							await modscript.ReloadInfo();
						}));
					}
				}
			}));
		}

		this.subscriptions.push(vscode.tasks.registerTaskProvider("factorio", this));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.openchangelog",
				async (mp:ModPackage)=>vscode.window.showTextDocument(vscode.Uri.joinPath(mp.resourceUri, "../changelog.txt"))
			));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.datestamp", async (mp:ModPackage)=>{
				const datestamptask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "datestamp" && t.definition.modname === mp.label)!;
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
			vscode.commands.registerCommand("factorio.details", async (mp:ModPackage)=>{
				const detailstask = (await vscode.tasks.fetchTasks({type: "factorio"})).find(t=>t.definition.command === "details" && t.definition.modname === mp.label)!;
				await vscode.tasks.executeTask(detailstask);
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
						await this.modPackages.get(uri.toString())?.ReloadInfo();
					} else {
						const pack = new ModPackage(uri, modscript, this.keychain, this.context, (mp)=>{ this._onDidChangeTreeData.fire(mp); }, this.gitapi);
						this.modPackages.set(uri.toString(), pack);
						await pack.ReloadInfo();
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
	private removeInfoJson(uri: vscode.Uri) {
		this.modPackages.delete(uri.toString());
		this._onDidChangeTreeData.fire(undefined);
	}
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}
	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		if (!element) {
			const items: vscode.TreeItem[] = [];
			if (this.modPackages) {
				const latest = ModPackage.latestPackages(this.modPackages.values());
				for (const modscript of this.modPackages.values()) {
					if (latest.has(modscript)) {
						items.push(modscript);
						const context = ["latest"];
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

	async discoverTestSpecs() {
		const modSuites = new Map<string, (WildcardTestSpec|TestSpec)[]>();
		for (const modpackage of ModPackage.latestPackages(this.modPackages.values())) {
			const suites = await modpackage.discoverTestSpecs();
			if (suites) {
				modSuites.set(modpackage.name, suites);
			}
		}
		return modSuites;
	}

	provideTasks(token?: vscode.CancellationToken): vscode.ProviderResult<vscode.Task[]> {
		const tasks:vscode.Task[] = [];

		const latest = ModPackage.latestPackages(this.modPackages.values());
		for (const modpackage of this.modPackages.values()) {
			if (!latest.has(modpackage)) { continue; }
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.datestamp`, type: "factorio", modname: modpackage.label, command: "datestamp"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.datestamp`,
				"factorio",
				modpackage.DateStampTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.package`, type: "factorio", modname: modpackage.label, command: "package"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.package`,
				"factorio",
				modpackage.PackageTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.version`, type: "factorio", modname: modpackage.label, command: "version"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.version`,
				"factorio",
				modpackage.IncrementTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.upload`, type: "factorio", modname: modpackage.label, command: "upload"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.upload`,
				"factorio",
				modpackage.PostToPortalTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.details`, type: "factorio", modname: modpackage.label, command: "details"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.details`,
				"factorio",
				modpackage.DetailsTask(),
				[]
			));
			tasks.push(new vscode.Task(
				{label: `${modpackage.name}.publish`, type: "factorio", modname: modpackage.label, command: "publish"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.name}.publish`,
				"factorio",
				modpackage.PublishTask(),
				[]
			));
		};

		return tasks;
	}

	resolveTaskExecution(task: vscode.Task, token?: vscode.CancellationToken) {
		if (task.definition.command === "adjustMods") {
			if (!task.definition.adjustMods) {
				return this.ConfigErrorTask(task.definition, "missing `adjustMods`");
			}
			if (!task.definition.modsPath) {
				return this.ConfigErrorTask(task.definition, "missing `modsPath`");
			}
			return this.AdjustModsTask(task.definition as AdjustModsDefinition);
		}

		if (!task.definition.modname) {
			return this.ConfigErrorTask(task.definition, "missing `modname`");
		}

		if (task.definition.command === "run") {
			if (!task.definition.script) {
				return this.ConfigErrorTask(task.definition, "missing `script`");
			}
		}

		const latest = ModPackage.latestPackages(this.modPackages.values());
		for (const modpackage of this.modPackages.values()) {
			if (modpackage.label === task.definition.modname && latest.has(modpackage)) {
				const mp = modpackage;
				switch (task.definition.command) {
					case "run":
						return mp.RunTask(task.definition.script, task.definition.scriptArgs);
					case "compile":
						return mp.RunTask("compile");
					case "datestamp":
						return mp.DateStampTask();
					case "package":
						return mp.PackageTask();
					case "version":
						return mp.IncrementTask();
					case "upload":
						return mp.PostToPortalTask();
					case "details":
						return mp.DetailsTask();
					case "publish":
						return mp.PublishTask();
					default:
						return this.ConfigErrorTask(task.definition, `unknown \`command\` "${task.definition.command}"`);
				}
			}
		}
		return this.ConfigErrorTask(task.definition, `mod "${task.definition.modname}" not found`);
	}

	resolveTask(task: vscode.Task, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.Task> {
		if (task.definition.type === "factorio") {
			const execution = this.resolveTaskExecution(task, token);


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

	private ConfigErrorTask(def:vscode.TaskDefinition, error:string): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(term=>{
				term.write(error+"\n");
				term.write(JSON.stringify(def, undefined, 2));
				term.close();
			});
		});
	}

	private getFMTKCLIPath() {
		return this.context.asAbsolutePath("./dist/fmtk-cli.js");
	}

	private AdjustModsTask(def:AdjustModsDefinition) {
		const args = [
			"mods", "--modsPath", def.modsPath, "adjust",
		];
		if (def.allowDisableBaseMod) {
			args.push("--allowDisableBase");
		}
		if (def.disableExtraMods) {
			args.push("--disableExtra");
		}
		for (const mod in def.adjustMods) {
			args.push(`${mod}=${def.adjustMods[mod]}`);
		}
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.getFMTKCLIPath(),
					args,
					process.cwd());
				term.close();
			});
		});
	}
}

const fmtk_config_file = vscode.Uri.file(path.join(tmpdir(), `vscode-${process.pid}-fmtk-config.json`));

export async function forkScript(term:ModTaskTerminal, module:string, args:string[], cwd:string, env?:NodeJS.ProcessEnv, stdin?:string): Promise<number> {
	const config = vscode.workspace.getConfiguration("factorio");

	await vscode.workspace.fs.writeFile(fmtk_config_file, Buffer.from(JSON.stringify(dotize.convert({
		docs: await config.get("docs"),
		package: await config.get("package"),
	}))));

	const scriptenv = Object.assign({}, process.env, env, {
		FMTK_CONFIG: fmtk_config_file.fsPath,
	});


	let execArgv = process.execArgv;
	for (const opt of config.get("tasks.execArgvOptions", [])) {
		switch (opt) {
			case "clear":
				execArgv = [];
				break;
			case "stripjsflags":
				execArgv = execArgv.filter(e=>!e.match(/^--js-flags/));
				break;
			case "stripinspect":
				execArgv = execArgv.filter(e=>!e.match(/^--inspect/));
				break;
		}
	}
	execArgv = [ ...execArgv, ...config.get("tasks.execArgvExtra", [])];

	scriptenv.Path = addBinToPath(scriptenv.Path??"");

	return new Promise((resolve, reject)=>{
		const scriptProc = fork(module, args, {
			cwd: cwd,
			execArgv: execArgv,
			env: scriptenv,
			stdio: "pipe",
		});

		const stdout = new BufferSplitter(scriptProc.stdout!, Buffer.from("\n"));
		stdout.on("segment", (chunk:Buffer)=>{
			term.write(chunk.toString()+"\r\n");
		});
		const stderr = new BufferSplitter(scriptProc.stderr!, Buffer.from("\n"));
		stderr.on("segment", (chunk:Buffer)=>{
			if (chunk.toString().match(/^Debugger listening/)) {
				console.log(chunk.toString());
			}
			term.write(chunk.toString()+"\r\n");
		});

		scriptProc.on("error", (error)=>{
			term.write(`${error.message}\r\n`);
		});

		scriptProc.on("exit", (code, signal)=>{
			vscode.workspace.fs.delete(fmtk_config_file);
			resolve(code ?? -1);
		});

		if (stdin) {
			scriptProc.stdin!.write(stdin);
		}
		scriptProc.stdin!.end();
	});

}
