/* eslint-disable @typescript-eslint/require-await */
import * as path from 'node:path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { discoverTestSpecs } from '../Test/TestSpec';
import type { API as GitAPI } from './git';
import type { Keychain } from './Keychain';
import { forkScript } from './ModPackageProvider';
import { ModTaskPseudoterminal } from './ModTaskPseudoterminal';

export interface ModPackageScripts {
	[key: string]: string | undefined
	datestamp?: string
	prepackage?: string
	version?: string
	prepublish?: string
	publish?: string
	postpublish?: string
}

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
		readme?: string
		faq?: string
		markdown?: {
			strip_first_header?: boolean
			images?: "gallery" | "url"
			links?: "url"
			base_url?: string
			url_match?: string
		}
		datestamp_format?: string
		no_git_push?: boolean
		no_git_tag?: boolean
		git_publish_branch?: string | null
		no_portal_upload?: boolean
		sync_portal_details?: boolean
		scripts?: ModPackageScripts
	}
}

export class ModPackage extends vscode.TreeItem {
	public readonly resourceUri: vscode.Uri;
	private modinfo: ModInfo;
	private readonly keychain: Keychain;
	private readonly context: vscode.ExtensionContext;
	private readonly _onDidChange: (mp: ModPackage) => void;
	private readonly gitapi?: GitAPI;
	constructor(resourceUri: vscode.Uri, modinfo: ModInfo, keychain: Keychain, context: vscode.ExtensionContext,
		_onDidChange: (mp: ModPackage) => void, gitapi?: GitAPI) {
		super(resourceUri);
		this.resourceUri = resourceUri;
		this.modinfo = modinfo;
		this.keychain = keychain;
		this.context = context;
		this._onDidChange = _onDidChange;
		this.gitapi = gitapi;

		this.command = {
			title: 'Open',
			command: 'vscode.open',
			arguments: [resourceUri],
		};

		this.UpdateTreeItemFields();
	}

	public get name(): string {
		return this.modinfo.name;
	}

	public get title(): string {
		return this.modinfo.title;
	}

	public get version(): string {
		return this.modinfo.version;
	}

	public get scripts(): ModPackageScripts | undefined {
		return this.modinfo.package?.scripts;
	}


	public static sort(this: void, a: ModPackage, b: ModPackage) {
		const namecomp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
		if (namecomp !== 0) { return namecomp * 100; }

		const vercomp = semver.compare(a.version, b.version, { "loose": true });
		if (vercomp !== 0) { return -vercomp * 10; }

		if (a.resourceUri < b.resourceUri) { return -1; }
		if (a.resourceUri > b.resourceUri) { return 1; }

		return 0;
	}

	public static latestPackages(packages: IterableIterator<ModPackage>) {
		const byModName = new Map<string, ModPackage[]>();
		for (const mp of packages) {
			if (byModName.has(mp.name)) {
				byModName.get(mp.name)!.push(mp);
			} else {
				byModName.set(mp.name, [mp]);
			}
		}
		const latest = new Set<ModPackage>();
		for (const mps of byModName.values()) {
			latest.add(mps.reduce((a, b)=>(semver.compare(a.version, b.version, { "loose": true }) < 0) ? b : a));
		}
		return latest;
	}

	private async gitLabel() {
		const repo = this.gitapi?.getRepository(this.resourceUri);
		if (repo) {
			const log = await repo.log({});
			let i = 0;
			for (; i < log.length; i++) {
				const entry = log[i];
				if ("refNames" in entry) {
					const refNames = entry.refNames as string[];
					const hasTag = refNames.some(s=>s.match(/^tag:/));
					if (hasTag) {
						return `+${i}`;
					}
				}
			}
		}

		return undefined;
	}

	public async discoverTestSpecs() {
		return discoverTestSpecs(this.resourceUri, vscode.workspace.fs);
	}

	public async ReloadInfo() {
		const infodoc = await vscode.workspace.openTextDocument(this.resourceUri);
		const jsonstr = infodoc.getText();
		this.modinfo = JSON.parse(jsonstr);

		const gitLabel = await this.gitLabel();
		this.UpdateTreeItemFields(gitLabel);
		this._onDidChange(this);
	}

	private UpdateTreeItemFields(gitLabel?: string) {
		this.label = this.name;
		this.description = gitLabel ? `${this.version} (${gitLabel})` : this.version;
		this.tooltip = this.title;
	}

	private getFMTKCLIPath() {
		return this.context.asAbsolutePath("./dist/fmtk-cli.js");
	}

	public RunTask(script: string, scriptArgs?: string[]) {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				await forkScript(term,
					this.getFMTKCLIPath(),
					["run", script, ...(scriptArgs ?? [])],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.ReloadInfo();
				term.close();
			});
		});
	}

	public DateStampTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				await forkScript(term,
					this.getFMTKCLIPath(),
					["datestamp"],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.ReloadInfo();
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
			return new ModTaskPseudoterminal(async (term)=>{
				await forkScript(term,
					this.getFMTKCLIPath(),
					args,
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.ReloadInfo();
				term.close();
			});
		});
	}

	public IncrementTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				await forkScript(term,
					this.getFMTKCLIPath(),
					["version"],
					vscode.Uri.joinPath(this.resourceUri, "..").fsPath);
				await this.ReloadInfo();
				term.close();
			});
		});
	}

	public PostToPortalTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				await this.ReloadInfo();
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
				const moddir = this.resourceUri.with({ path: packagebase });
				const direntries = await vscode.workspace.fs.readDirectory(moddir);
				const packages = direntries.filter(([name, type])=>{
					return type === vscode.FileType.File && name.startsWith(this.name) && name.match(/_\d+\.\d+\.\d+\.zip$/);
				}).map(([name, type])=>{ return name; }).sort().reverse();
				const packagename = await vscode.window.showQuickPick(packages, { placeHolder: "Select Package to upload" });
				if (!packagename) {
					term.close();
					return;
				}
				const packagepath = path.join(moddir.fsPath, packagename);
				const APIKeyReady = await this.keychain.ReadyAPIKey();
				if (APIKeyReady) {
					await forkScript(term,
						this.getFMTKCLIPath(),
						["upload", packagepath, this.name],
						vscode.Uri.joinPath(this.resourceUri, "..").fsPath,
						(APIKeyReady.from !== "env") ? { FACTORIO_UPLOAD_API_KEY: APIKeyReady.key } : undefined);
				}
				await this.ReloadInfo();
				term.close();
			});
		});
	}

	public DetailsTask() {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				const APIKeyReady = await this.keychain.ReadyAPIKey();
				if (APIKeyReady) {
					await forkScript(term,
						this.getFMTKCLIPath(),
						["details"],
						vscode.Uri.joinPath(this.resourceUri, "..").fsPath,
						(APIKeyReady.from !== "env") ? { FACTORIO_UPLOAD_API_KEY: APIKeyReady.key } : undefined);
				}
				await this.ReloadInfo();
				term.close();
			});
		});
	}

	public PublishTask(): vscode.CustomExecution {
		return new vscode.CustomExecution(async ()=>{
			return new ModTaskPseudoterminal(async (term)=>{
				const APIKeyReady = await this.keychain.ReadyAPIKey();
				if (APIKeyReady) {
					await forkScript(term,
						this.getFMTKCLIPath(),
						["publish"],
						vscode.Uri.joinPath(this.resourceUri, "..").fsPath,
						(APIKeyReady.from !== "env") ? { FACTORIO_UPLOAD_API_KEY: APIKeyReady.key } : undefined);
				}
				await this.ReloadInfo();
				term.close();
			});
		});
	}
}
