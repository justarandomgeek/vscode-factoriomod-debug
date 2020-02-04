import * as vscode from 'vscode'
import * as fs from 'fs';
import * as path from 'path';
import * as Git from './git';
import * as WebRequest from 'web-request';
import { jar } from 'request'
import { exec } from 'child_process';

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
		no_portal_upload?: boolean;
		scripts?: ModPackageScripts;
	};
};

export class ModTaskProvider implements vscode.TaskProvider{
	private modPackages: Map<string, ModPackage>

	constructor(context: vscode.ExtensionContext, modPackages: Map<string, ModPackage>) {
		this.modPackages = modPackages;
	}
	provideTasks(token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task[]> {
		let tasks:vscode.Task[] = []

		this.modPackages.forEach((mp,uri) => {
			tasks.push(new vscode.Task(
				{label:`${mp.label}.package`,type:"factorio",modname:mp.resourceUri!.toString(),command:"package"},
				vscode.workspace.getWorkspaceFolder(mp.resourceUri!) || vscode.TaskScope.Workspace,
				`${mp.label}.package`,
				"factorio",
				new vscode.CustomExecution(async ()=>{
					return new ModTaskPseudoterminal(async term =>{
						await mp.Update()
						await mp.Package(term)
						term.close()
					})
				})
			))
			tasks.push(new vscode.Task(
				{label:`${mp.label}.publish`,type:"factorio",modname:mp.resourceUri!.toString(),command:"publish"},
				vscode.workspace.getWorkspaceFolder(mp.resourceUri!) || vscode.TaskScope.Workspace,
				`${mp.label}.publish`,
				"factorio",
				new vscode.CustomExecution(async ()=>{
					return new ModTaskPseudoterminal(async term =>{
						await mp.Update()
						await mp.Publish(term)
						term.close()
					})
				})
			))

		},this)

		return tasks
	}

	resolveTask(task: vscode.Task, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task> {
		if (task.definition.type == "factorio")
		{
			const mp = this.modPackages.get(task.definition.modname)
			if(mp)
			{
				switch (task.definition.command) {
					case "package":
						task.execution = new vscode.CustomExecution(async ()=>{
							return new ModTaskPseudoterminal(async term =>{
								await mp.Update()
								await mp.Package(term)
								term.close()
							})
						})
						return task;

					case "publish":
						task.execution = new vscode.CustomExecution(async ()=>{
							return new ModTaskPseudoterminal(async term =>{
								await mp.Update()
								await mp.Publish(term)
								term.close()
							})
						})
						return task;
				}
			}
		}
	}
}

export class ModPackage extends vscode.TreeItem {
	public packageIgnore?: string[];
	public noGitPush?: boolean;
	public noPortalUpload?: boolean;
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
		this.noPortalUpload = modscript.package?.no_portal_upload;
		this.scripts = modscript.package?.scripts
	}

	public async Update()
	{
		const modscript: modpackageinfo = JSON.parse((await vscode.workspace.fs.readFile(this.resourceUri!)).toString());

		this.label = modscript.name;
		this.description = modscript.version;
		this.tooltip = modscript.title;
		this.packageIgnore = modscript.package?.ignore;
		this.noGitPush = modscript.package?.no_git_push;
		this.noPortalUpload = modscript.package?.no_portal_upload;
		this.scripts = modscript.package?.scripts
	}

	public async DateStampChangelog(term:ModTaskTerminal): Promise<vscode.TextDocument | undefined>
	{
		const moddir = path.dirname(this.resourceUri!.fsPath)
		const changelogpath = path.join(moddir, "changelog.txt")
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
				term.write(`Changelog section ${this.description} stamped ${new Date().toISOString().substr(0,10)}\r\n`)
			}
			else
			{
				term.write(`No Changelog section for ${this.description}\r\n`)
			}
			return changelogdoc
		}
		else
		{
			term.write(`No Changelog found\r\n`)
		}
	}

	public async Package(term:ModTaskTerminal): Promise<string|undefined>
	{
		const moddir = path.dirname(this.resourceUri!.fsPath)
		if(this.scripts?.prepackage)
		{
			let code = await runScript(term, "prepackage", this.scripts.prepackage, moddir)
			if (code != 0) return
		}
		const packagepath = `${moddir}${this.label}_${this.description}.zip`
		var zipoutput = fs.createWriteStream(packagepath);
		var archive = archiver('zip', { zlib: { level: 9 }});
		archive.pipe(zipoutput)
		archive.glob("**",{ cwd: moddir, root: moddir, ignore: this.packageIgnore },{ prefix: `${this.label}_${this.description}` })
		archive.finalize()
		term.write(`Built ${this.label}_${this.description}.zip\r\n`)
		return packagepath
	}

	public async IncrementVersion(changelogdoc: vscode.TextDocument|undefined, term:ModTaskTerminal): Promise<string>
	{
		let we = new vscode.WorkspaceEdit()
		// increment info.json version
		await vscode.workspace.openTextDocument(this.resourceUri!)
		let syms = await vscode.commands.executeCommand<(vscode.SymbolInformation|vscode.DocumentSymbol)[]>
												("vscode.executeDocumentSymbolProvider", this.resourceUri!)

		//TODO: parse this properly to handle x.y to become x.y.1 instead of x.y+1
		const newversion = (<string>this.description).replace(/\.([0-9]+)$/,(patch)=>{return `.${Number.parseInt(patch.substr(1))+1}`})
		let version = syms!.find(sym=>sym.name == "version")!

		we.replace(this.resourceUri!,
			version instanceof vscode.SymbolInformation ? version.location.range : version.selectionRange,
			`"version": "${newversion}"`)
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
		term.write(`Moved version to ${newversion}\r\n`)
		return newversion
	}

	public async PostToPortal(packagepath: string, packageversion:string, term:ModTaskTerminal)
	{

		// upload to portal
		let cookiejar = jar()
		try {
			let loginform = await WebRequest.get("https://mods.factorio.com/login",{jar:cookiejar})
			let logintoken = ((loginform.content.match(/<input [^>]+"csrf_token"[^>]+>/)||[])[0]?.match(/value="([^"]*)"/)||[])[1]
			let config = vscode.workspace.getConfiguration(undefined,this.resourceUri)

			term.write(`Logging in to Mod Portal as '${config.get("factorio.portal.username")}'\r\n`)
			let loginresult = await WebRequest.post("https://mods.factorio.com/login",{jar:cookiejar, throwResponseError: true,
				form:{
					csrf_token:logintoken,
					username: config.get("factorio.portal.username"),
					password: config.get("factorio.portal.password")
				}
			})

			let loginerr = loginresult.content.match(/<ul class="flashes">[\s\n]*<li>(.*)<\/li>/)
			if (loginerr) throw new Error(loginerr[1])

		} catch (error) {
			term.write(`Failed to log in to Mod Portal: \r\n${error.toString()}\r\n`)
			return
		}

		let uploadtoken
		try {
			let uploadform = await WebRequest.get(`https://mods.factorio.com/mod/${this.label}/downloads/edit`,{jar:cookiejar, throwResponseError: true})
			uploadtoken = uploadform.content.match(/\n\s*token:\s*'([^']*)'/)![1]
		} catch (error) {
			term.write("Failed to get upload token from Mod Portal: " + error.toString())
			return
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
			term.write("Failed to upload zip to Mod Portal: " + error.toString())
			return
		}

		let uploadresultjson = JSON.parse(uploadresult.content)

		try {
			let postresult = await WebRequest.post(`https://mods.factorio.com/mod/${this.label}/downloads/edit`, {
				jar:cookiejar, throwResponseError: true,
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
				term.write(`Published ${this.label} version ${packageversion}`)
			}
			else
			{
				let message = postresult.content.match(/category:\s*'error',\s*\n\s*message:\s*'([^']*)'/)![1]
				throw message
			}
		} catch (error) {
			term.write("Failed to post update to Mod Portal: " + error.toString())
			return
		}
	}

	public async Publish(term:ModTaskTerminal)
	{

		const moddir = path.dirname(this.resourceUri!.fsPath)
		const gitExtension = vscode.extensions.getExtension<Git.GitExtension>('vscode.git')!.exports;
		const git = gitExtension.getAPI(1);
		const repo = git.getRepository(this.resourceUri!)

		const packageversion = <string>this.description

		if (repo)
		{
			// throw if uncomitted changes
			if (repo.state.workingTreeChanges.length > 0)
			{
				term.write("Cannot Publish with uncommitted changes\r\n")
				return
			}
			// throw if not on master
			if (repo.state.HEAD?.name !== "master")
			{
				term.write("Cannot Publish on branch other than 'master'\r\n")
				return
			}
			let config = vscode.workspace.getConfiguration(undefined,this.resourceUri)
			if (!this.noPortalUpload && !(config.get("factorio.portalUsername") ?? config.get("factorio.portalPassword")))
			{
				term.write("Configure Factorio Mod Portal username/password in settings to upoad to Mod Portal\r\n")
				return
			}
		}

		if(this.scripts?.prepublish)
		{
			let code = await runScript(term, "prepublish", this.scripts.prepublish, moddir)
			if (code != 0) return
		}

		let changelogdoc = await this.DateStampChangelog(term)

		if (repo)
		{
			if(changelogdoc) await runScript(term, undefined, `git add changelog.txt`, moddir)
			await runScript(term, undefined, `git commit --allow-empty -m "preparing release of version ${packageversion}"`, moddir)
			await runScript(term, undefined, `git tag ${packageversion}`, moddir)
		}

		// build zip with <factorio.package>
		const packagepath = await this.Package(term)
		if (!packagepath) return

		let newversion = await this.IncrementVersion(changelogdoc,term)

		if(this.scripts?.publish)
		{
			let code = await runScript(term, "publish", this.scripts.publish, moddir)
			if (code != 0) return
		}

		if (repo)
		{
			await runScript(term, undefined, `git add info.json`, moddir)
			if(changelogdoc) await runScript(term, undefined, `git add changelog.txt`, moddir)
			await runScript(term, undefined, `git commit -m "moved to version ${newversion}"`, moddir)
		}

		const upstream = repo?.state.HEAD?.upstream
		if (upstream && !this.noGitPush)
		{
			await runScript(term, undefined, `git push ${upstream.remote} master ${newversion}`, moddir)
		}

		if(!this.noPortalUpload)
			await this.PostToPortal(packagepath, packageversion, term)
	}
}
export class ModsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

	private modPackages: Map<string, ModPackage>;
	constructor(context: vscode.ExtensionContext) {
		const subscriptions = context.subscriptions;

		this.modPackages = new Map<string, ModPackage>();
		vscode.workspace.findFiles('**/info.json').then(infos => { infos.forEach(this.updateInfoJson, this); });
		let infoWatcher = vscode.workspace.createFileSystemWatcher('**/info.json');
		infoWatcher.onDidChange(this.updateInfoJson, this);
		infoWatcher.onDidCreate(this.updateInfoJson, this);
		infoWatcher.onDidDelete(this.removeInfoJson, this);
		subscriptions.push(infoWatcher);

		context.subscriptions.push(vscode.tasks.registerTaskProvider("factorio",new ModTaskProvider(context, this.modPackages)))

		context.subscriptions.push(
			vscode.commands.registerCommand("factorio.package",async (mp:ModPackage) => {
				let packagetask = (await vscode.tasks.fetchTasks({type:"factorio"})).find(t=>
					t.definition.command == "package" && t.definition.modname == mp.resourceUri!.toString())!
				await vscode.tasks.executeTask(packagetask)
			}))

		context.subscriptions.push(
			vscode.commands.registerCommand("factorio.publish",async (mp:ModPackage) => {
				let publishtask = (await vscode.tasks.fetchTasks({type:"factorio"})).find(t=>
					t.definition.command == "publish" && t.definition.modname == mp.resourceUri!.toString())!
				await vscode.tasks.executeTask(publishtask)

			}))
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

interface ModTaskTerminal {
	write(data:string):void
	close():void
}

function runScript(term:ModTaskTerminal, name:string|undefined, command:string, cwd:string): Promise<number>
{
	return new Promise((resolve,reject)=>{
		if(name)
		{
			term.write(`>> Running mod script "${name}": ${command} <<\r\n`)
		}
		else
		{
			term.write(`${command}\r\n`)
		}

		exec(command,
			{ cwd: cwd, encoding: "utf8", },
			(error,stdout,stderr)=>{
				if(stderr)
				{
					term.write(stderr.replace(/([^\r])\n/g,"$1\r\n"))
					if(!stderr.endsWith("\n"))
						term.write("\r\n")
				}
				if(stdout)
				{
					term.write(stdout.replace(/([^\r])\n/g,"$1\r\n"))
					if(!stdout.endsWith("\n"))
						term.write("\r\n")
				}
				if(name)
					term.write(`>> Mod script "${name}" returned ${error?.code || 0} <<\r\n`)
				resolve(error?.code || 0)
			});
	})

}

class ModTaskPseudoterminal implements vscode.Pseudoterminal {
	private writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private closeEmitter = new vscode.EventEmitter<void>();
	onDidClose?: vscode.Event<void> = this.closeEmitter.event;
	private tokensource = new vscode.CancellationTokenSource();

	constructor(
		private runner:(term:ModTaskTerminal,token?:vscode.CancellationToken)=>void|Promise<void>) {
	}

	async open(initialDimensions: vscode.TerminalDimensions | undefined): Promise<void> {
		let writeEmitter = this.writeEmitter
		let closeEmitter = this.closeEmitter
		await this.runner({
			write: (data) => writeEmitter.fire(data),
			close: () => closeEmitter.fire()
		}, this.tokensource.token);
		closeEmitter.fire();
	}

	close(): void {
		this.tokensource.cancel()
	}
}
