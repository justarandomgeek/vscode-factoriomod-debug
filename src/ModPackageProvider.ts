import * as vscode from 'vscode'
import * as fs from 'fs';
import * as Git from './git';
import * as WebRequest from 'web-request';
import { jar } from 'request'
import { execSync } from 'child_process';

var archiver = require('archiver');

interface ModPackageScripts {
	prepublish?: string
	prepackage?: string
	publish?: string
};

interface modpackageinfo {
	name: string;
	version: string;
	factorio_version: string;
	title: string;
	package?: {
		ignore?: string[];
		no_git_push?: boolean;
		scripts?: ModPackageScripts;
	};
};

export class ModPackage extends vscode.TreeItem {
	public packageIgnore?: string[];
	public noGitPush?: boolean;
	public scripts?: ModPackageScripts;

	constructor(uri: vscode.Uri, modscript: modpackageinfo) {
		super(uri);
		this.label = modscript.name;
		this.description = modscript.version;
		this.tooltip = modscript.title;
		this.contextValue = "mod";
		this.command = {
			title: 'Open',
			command: 'vscode.open',
			arguments: [uri]
		};
		//this.id = modscript.name;
		this.packageIgnore = modscript.package?.ignore;
		this.noGitPush = modscript.package?.no_git_push;
		this.scripts = modscript.package?.scripts
	}

	public async runScript(name:string,command:string,cwd:string)
	{
		//try {
			return execSync(command,{ cwd: cwd, encoding: "utf8",  })
		//} catch (error) {
		//	throw `script ${name} failed:\n${error.message}`
		//}

	}

	public async runAsTask(name:string,command:string,cwd:string)
	{
		await vscode.tasks.executeTask(new vscode.Task(
			{
				type:"factorio",
				label: name
			},
			vscode.TaskScope.Workspace, name, "factorio",
			new vscode.ShellExecution(command,{cwd:cwd}),
			[]
		))
	}

	public async Update()
	{
		const modscript: modpackageinfo = JSON.parse((await vscode.workspace.fs.readFile(this.resourceUri!)).toString());

		this.label = modscript.name;
		this.description = modscript.version;
		this.tooltip = modscript.title;
		this.packageIgnore = modscript.package?.ignore;
		this.noGitPush = modscript.package?.no_git_push;
		this.scripts = modscript.package?.scripts
	}

	public async DateStampChangelog(): Promise<vscode.TextDocument | undefined>
	{
		const moddir = this.resourceUri!.fsPath.replace(/info.json$/,"")
		const changelogpath = `${moddir}changelog.txt`
		if(fs.existsSync(changelogpath))
		{
			//datestamp current section
			let changelogdoc = await vscode.workspace.openTextDocument(changelogpath)
			let syms = <vscode.DocumentSymbol[]>await vscode.commands.executeCommand<(vscode.SymbolInformation|vscode.DocumentSymbol)[]>("vscode.executeDocumentSymbolProvider", changelogdoc.uri)
			let current = syms?.find(sym=>sym.name.startsWith(this.description!.toString()))!
			if (current)
			{
				let date = current.children.find(sym=>sym.name == "Date")
				let we = new vscode.WorkspaceEdit()
				if (date)
				{
					we.replace(changelogdoc.uri,date.selectionRange, new Date().toISOString().substr(0,10))
				}
				else
				{
					we.insert(changelogdoc.uri,current.selectionRange.end,`\nDate: ${new Date().toISOString().substr(0,10)}`)
				}
				await vscode.workspace.applyEdit(we)
				await vscode.workspace.saveAll()
			}
			return changelogdoc
		}
	}

	public async Package(): Promise<string>
	{
		const moddir = this.resourceUri!.fsPath.replace(/info.json$/,"")
		if(this.scripts?.prepackage) await this.runScript("prepackage", this.scripts.prepackage, moddir)
		const packagepath = `${moddir}${this.label}_${this.description}.zip`
		var output = fs.createWriteStream(packagepath);
		var archive = archiver('zip', {
		zlib: { level: 9 } // Sets the compression level.
		});
		archive.pipe(output)
		archive.glob("**",{
			cwd: moddir,
			root: moddir,
			ignore: this.packageIgnore
		},{
			prefix: `${this.label}_${this.description}`
		})
		archive.finalize()
		vscode.window.showInformationMessage(`Built ${this.label}_${this.description}.zip`)
		return packagepath
	}

	public async IncrementVersion(changelogdoc?: vscode.TextDocument): Promise<string>
	{
		let we = new vscode.WorkspaceEdit()
		// increment info.json version
		let packageinfo = await vscode.workspace.openTextDocument(this.resourceUri!)
		let syms = await vscode.commands.executeCommand<(vscode.SymbolInformation|vscode.DocumentSymbol)[]>
												("vscode.executeDocumentSymbolProvider", this.resourceUri!)

		const newversion = (<string>this.description).replace(/\.([0-9]+)$/,(patch)=>{return `.${Number.parseInt(patch.substr(1))+1}`})
		let version = syms!.find(sym=>sym.name == "version")!

		we.replace(this.resourceUri!,
			version instanceof vscode.SymbolInformation? version.location.range: version.selectionRange,`"version": "${newversion}"`)
		if(changelogdoc)
		{
			//insert new section
			we.insert(changelogdoc.uri,new vscode.Position(0,0),
			"---------------------------------------------------------------------------------------------------\n" +
			`Version: ${newversion}\n` +
			"Date: ????\n" +
			"  Changes:\n"
			// no placeholder line because prefix alone is not valid...
			)
		}
		await vscode.workspace.applyEdit(we)
		await vscode.workspace.saveAll()
		return newversion
	}

	public async PostToPortal(packagepath?: string, packageversion?:string)
	{
		if (packagepath) {
			// upload to portal
			let cookiejar = jar()
			try {
				let loginform = await WebRequest.get("https://mods.factorio.com/login",{jar:cookiejar})
				let logintoken = ((loginform.content.match(/<input [^>]+"csrf_token"[^>]+>/)||[])[0]?.match(/value="([^"]*)"/)||[])[1]
				let config = vscode.workspace.getConfiguration(undefined,this.resourceUri)

				let loginresult = await WebRequest.post("https://mods.factorio.com/login",{jar:cookiejar, throwResponseError: true,
					form:{
						csrf_token:logintoken,
						username: config.get("factorio.portalUsername"),
						password: config.get("factorio.portalPassword")
					}
				})

				let loginerr = loginresult.content.match(/<ul class="flashes">[\s\n]*<li>(.*)<\/li>/)
				if (loginerr) throw loginerr

			} catch (error) {
				throw "Failed to log in to Mod Portal: " + error.toString()
			}

			let uploadtoken
			try {
				let uploadform = await WebRequest.get(`https://mods.factorio.com/mod/${this.label}/downloads/edit`,{jar:cookiejar, throwResponseError: true})
				uploadtoken = uploadform.content.match(/\n\s*token:\s*'([^']*)'/)![1]
			} catch (error) {
				throw "Failed to get upload token from Mod Portal: " + error.toString()
			}

			let uploadresult
			try {
				uploadresult = await WebRequest.post(`https://direct.mods-data.factorio.com/upload/mod/${uploadtoken}`, {jar:cookiejar, throwResponseError: true,
				formData:{
					file:{
						value:  fs.createReadStream(packagepath),
						options: {
							filename: `${this.label}_${packageversion}.zip`,
							contentType: 'application/x-zip-compressed'
						}
					}
				}})
			} catch (error) {
				throw "Failed to upload zip to Mod Portal: " + error.toString()
			}

			let uploadresultjson = JSON.parse(uploadresult.content)

			try {
				let postresult = await WebRequest.post(`https://mods.factorio.com/mod/${this.label}/downloads/edit`,{jar:cookiejar, throwResponseError: true,
					form:{
						file:undefined,
						info_json:uploadresultjson.info,
						changelog:uploadresultjson.changelog,
						filename:uploadresultjson.filename,
						file_size: fs.statSync(packagepath).size ,
						thumbnail:uploadresultjson.thumbnail
					}
				})
				if (postresult.statusCode == 302) {
					vscode.window.showInformationMessage(`Published ${this.label} version ${packageversion}`)
				}
				else
				{
					let message = uploadtoken = postresult.content.match(/category:\s*'error',\s*\n\s*message:\s*'([^']*)'/)![1]
					throw message
				}
			} catch (error) {
				throw "Failed to post update to Mod Portal: " + error.toString()
			}
		}
	}
}
export class ModsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

	private modPackages: Map<string, ModPackage>;
	constructor(context: vscode.ExtensionContext) {
		const subscriptions = context.subscriptions;

	context.subscriptions.push(
		vscode.commands.registerCommand("factorio.package",async (mp:ModPackage) => {
			await mp.Update()
			return await vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: "Packaging...", }, async ()=>mp.Package())
		}))

	context.subscriptions.push(
		vscode.commands.registerCommand("factorio.publish",async (mp:ModPackage) => {
			await mp.Update()
			vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: "Publishing..." }, async ()=> {
				const moddir = mp.resourceUri!.fsPath.replace(/info.json$/,"")
				const gitExtension = vscode.extensions.getExtension<Git.GitExtension>('vscode.git')!.exports;
				const git = gitExtension.getAPI(1);
				const repo = git.getRepository(mp.resourceUri!)

				const packageversion = <string>mp.description

				if (repo)
				{
					// throw if uncomitted changes
					if (repo.state.workingTreeChanges.length > 0)
					{
						vscode.window.showErrorMessage("Cannot Publish with uncommitted changes")
						return
					}
					// throw if not on master
					if (repo.state.HEAD?.name !== "master")
					{
						vscode.window.showErrorMessage("Cannot Publish on branch other than 'master'")
						return
					}
					let config = vscode.workspace.getConfiguration(undefined,mp.resourceUri)
					if (! (config.get("factorio.portalUsername") ?? config.get("factorio.portalPassword")))
					{
						vscode.window.showErrorMessage("Configure Factorio Mod Portal username/password in settings to use Publish")
						return
					}
				}

				if(mp.scripts?.prepublish) await mp.runScript("prepublish", mp.scripts.prepublish, moddir)

				let changelogdoc = await mp.DateStampChangelog()

				if (repo)
				{
					//execSync(`git add info.json`,{cwd: moddir })
					if(changelogdoc) execSync(`git add changelog.txt`,{cwd: moddir })
					execSync(`git commit --allow-empty -m "preparing release of version ${packageversion!}"`,{cwd: moddir })
					try {
						execSync(`git tag ${packageversion}`,{cwd: moddir })
					} catch (error) {
						vscode.window.showWarningMessage(error.toString())
					}

				}

				// build zip with <factorio.package>
				const packagepath = await vscode.commands.executeCommand<string>("factorio.package",mp)

				let newversion = await mp.IncrementVersion(changelogdoc)

				if(mp.scripts?.publish) await mp.runScript("publish", mp.scripts.publish, moddir)

				if (repo)
				{
					execSync(`git add info.json`,{cwd: moddir })
					if(changelogdoc) execSync(`git add changelog.txt`,{cwd: moddir })
					execSync(`git commit -m "moved to version ${newversion}"`,{cwd: moddir })
				}

				try{
					if (repo && !mp.noGitPush && repo.state.HEAD?.upstream )
					{
						const upstream = repo.state.HEAD.upstream
						execSync(`git push ${upstream.remote} master ${newversion}`,{cwd: moddir })
					}
				} catch (error) {
					vscode.window.showErrorMessage("git push failed: " + error.toString())
				}

				try {
					await mp.PostToPortal(packagepath, packageversion)
				} catch (error) {
					vscode.window.showErrorMessage(error.toString())
				}

			})
		}))

		this.modPackages = new Map<string, ModPackage>();
		vscode.workspace.findFiles('**/info.json').then(infos => { infos.forEach(this.updateInfoJson, this); });
		let infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		infoWatcher.onDidChange(this.updateInfoJson, this);
		infoWatcher.onDidCreate(this.updateInfoJson, this);
		infoWatcher.onDidDelete(this.removeInfoJson, this);
		subscriptions.push(infoWatcher);
	}
	private async updateInfoJson(uri: vscode.Uri) {
		const modscript: modpackageinfo = JSON.parse((await vscode.workspace.fs.readFile(uri)).toString());
		if (modscript.name) {
			if (this.modPackages.has(uri.toString())) {
				await this.modPackages.get(uri.toString())?.Update()
			}
			else
			{
				this.modPackages.set(uri.toString(), new ModPackage(uri, modscript));
			}
		}
		else {
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
	getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
		if (!element) {
			let items: vscode.TreeItem[] = [];
			if (this.modPackages) {
				this.modPackages.forEach((modscript, uri) => {
					items.push(modscript);
				});
			}
			return items;
		}
		else if (element instanceof ModPackage) {
			return [];
		}
		else {
			return [];
		}
	}
}
