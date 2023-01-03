import * as vscode from 'vscode';
import * as path from 'path';
import * as semver from 'semver';
import { fork } from 'child_process';
import { BufferSplitter } from '../Util/BufferSplitter';
import { Keychain } from './Keychain';
import { platform } from 'os';
import inspector from 'inspector';

interface ModPackageScripts {
	[key:string]: string|undefined
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
		extra?: {
			root: string
			glob?: string
			ignore?: string[]
		}[]
		gallery?: string[]
		prune_gallery?: boolean
		readme?:string
		faq?:string
		no_git_push?: boolean
		no_git_tag?: boolean
		git_publish_branch?: string|null
		no_portal_upload?: boolean
		no_portal_details?: boolean
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

export async function activateModPackageProvider(context:vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		const keychain = new Keychain(context.secrets);
		context.subscriptions.push(vscode.commands.registerCommand("factorio.clearApiKey", async ()=>{
			await keychain.ClearApiKey();
		}));
		const treeDataProvider = new ModsTreeDataProvider(context, keychain);
		context.subscriptions.push(treeDataProvider);
		const view = vscode.window.createTreeView('factoriomods', { treeDataProvider: treeDataProvider });
		context.subscriptions.push(view);
		await MigrateAPIKeyStorage(keychain);
		extensionUri = context.extensionUri;
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
	constructor(
		private readonly context:vscode.ExtensionContext,
		private readonly modPackages: Map<string, ModPackage>
	) {}


	provideTasks(token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task[]> {
		const tasks:vscode.Task[] = [];

		const latest = ModPackage.latestPackages(this.modPackages.values());
		for (const modpackage of this.modPackages.values()) {
			if (!latest.has(modpackage)) { continue; }
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
				{label: `${modpackage.label}.details`, type: "factorio", modname: modpackage.label, command: "details"},
				vscode.workspace.getWorkspaceFolder(modpackage.resourceUri) || vscode.TaskScope.Workspace,
				`${modpackage.label}.details`,
				"factorio",
				modpackage.DetailsTask(),
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

	resolveTaskExecution(task: vscode.Task, token?: vscode.CancellationToken | undefined) {
		if (task.definition.command === "adjustMods") {
			if (!task.definition.adjustMods) {
				return this.ConfigErrorTask(task.definition, "missing `adjustMods`");
			}
			if (!task.definition.modsPath) {
				return this.ConfigErrorTask(task.definition, "missing `modsPath`");
			}
			return this.AdjustModsTask(<AdjustModsDefinition>task.definition);
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

	resolveTask(task: vscode.Task, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task> {
		if (task.definition.type === "factorio") {
			let execution = this.resolveTaskExecution(task, token);


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
			return new ModTaskPseudoterminal(async term=>{
				term.write(error+"\n");
				term.write(JSON.stringify(def, undefined, 2));
				term.close();
			});
		});
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
					this.context.asAbsolutePath("./dist/fmtk.js"),
					args,
					process.cwd());
				term.close();
			});
		});
	}
}

class ModPackage extends vscode.TreeItem {
	public label: string; // used as modname
	public description: string; // used as modversion
	public scripts?: ModPackageScripts;

	constructor(
		public readonly resourceUri: vscode.Uri,
		modscript: ModInfo,
		private readonly keychain: Keychain,
		private readonly context:vscode.ExtensionContext,
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
		this.scripts = modscript.package?.scripts;
	}

	public RunTask(script:string, scriptArgs?:string[]) {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.context.asAbsolutePath("./dist/fmtk.js"),
					["run", script, ...(scriptArgs??[])],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.Update();
				term.close();
			});
		});
	}

	public DateStampTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.context.asAbsolutePath("./dist/fmtk.js"),
					["datestamp"],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.Update();
				term.close();
			});
		});
	}

	public PackageTask() {
		const args = [
			"package",
		];
		const config = vscode.workspace.getConfiguration(undefined, this.resourceUri);
		if (config.get<string>("factorio.package.zipLocation", "inside") === "outside") {
			args.push("--outdir");
			args.push("..");
		}
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.context.asAbsolutePath("./dist/fmtk.js"),
					args,
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.Update();
				term.close();
			});
		});
	}

	public IncrementTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.context.asAbsolutePath("./dist/fmtk.js"),
					["version"],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.Update();
				term.close();
			});
		});
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
				const APIKey = await this.keychain.GetAPIKey();
				if (APIKey) {
					await forkScript(term,
						this.context.asAbsolutePath("./dist/fmtk.js"),
						["upload", packagepath, this.label ],
						vscode.Uri.joinPath(this.resourceUri, "..").fsPath,
						{
							FACTORIO_UPLOAD_API_KEY: APIKey,
						});
				}
				await this.Update();
				term.close();
			});
		});
	}

	public DetailsTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				await forkScript(term,
					this.context.asAbsolutePath("./dist/fmtk.js"),
					["details"],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.Update();
				term.close();
			});
		});
	}

	public PublishTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async term=>{
				const APIKey = await this.keychain.GetAPIKey();
				if (APIKey) {
					await forkScript(term,
						this.context.asAbsolutePath("./dist/fmtk.js"),
						["publish"],
						vscode.Uri.joinPath(this.resourceUri, "..").fsPath,
						{
							FACTORIO_UPLOAD_API_KEY: APIKey,
						});
				}
				await this.Update();
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
	constructor(
		private readonly context:vscode.ExtensionContext,
		private readonly keychain:Keychain
	) {
		this.modPackages = new Map<string, ModPackage>();
		vscode.workspace.findFiles('**/info.json').then(infos=>{ infos.forEach(this.updateInfoJson, this); });
		const infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		this.subscriptions.push(infoWatcher.onDidChange(this.updateInfoJson, this));
		this.subscriptions.push(infoWatcher.onDidCreate(this.updateInfoJson, this));
		this.subscriptions.push(infoWatcher.onDidDelete(this.removeInfoJson, this));
		this.subscriptions.push(infoWatcher);

		this.subscriptions.push(vscode.tasks.registerTaskProvider("factorio", new ModTaskProvider(this.context, this.modPackages)));

		this.subscriptions.push(
			vscode.commands.registerCommand("factorio.openchangelog",
				async (mp:ModPackage)=>vscode.window.showTextDocument(vscode.Uri.joinPath(mp.resourceUri, "../changelog.txt"))
			));

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
						this.modPackages.set(uri.toString(), new ModPackage(uri, modscript, this.keychain, this.context));
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

export async function forkScript(term:ModTaskTerminal, module:string, args:string[], cwd:string, env?:NodeJS.ProcessEnv, stdin?:string): Promise<number> {
	const config = vscode.workspace.getConfiguration("factorio");

	const scriptenv = Object.assign({}, process.env, env, {
		FMTK_CONFIG: JSON.stringify({
			docs: await config.get("docs"),
			package: await config.get("package"),
		}),
	});

	scriptenv.Path = addBinToPath(scriptenv.Path??"");

	return new Promise((resolve, reject)=>{
		const inspect = !!inspector.url();
		const scriptProc = fork(module, args, {
			cwd: cwd,
			execArgv: inspect ? ["--nolazy", "--inspect-brk=34200"] : undefined,
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
			resolve(code ?? -1);
		});

		if (stdin) {
			scriptProc.stdin!.write(stdin);
		}
		scriptProc.stdin!.end();
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
