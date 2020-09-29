'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as ini from 'ini';
import { FactorioModDebugSession } from './factorioModDebug';
import { validateLocale, LocaleColorProvider, LocaleDocumentSymbolProvider, LocaleCodeActionProvider } from './LocaleLangProvider';
import { ChangelogCodeActionProvider, validateChangelogTxt, ChangelogDocumentSymbolProvider } from './ChangeLogLangProvider';
import { ModsTreeDataProvider } from './ModPackageProvider';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	const provider = new FactorioModConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

	// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
	const factory = new InlineDebugAdapterFactory(context);

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
	context.subscriptions.push(factory);


	diagnosticCollection = vscode.languages.createDiagnosticCollection('factorio');
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'factorio-changelog' }, new ChangelogCodeActionProvider()));

	vscode.workspace.findFiles("**/changelog.txt").then(uris => {
		// check diagnostics
		uris.forEach(async uri=> diagnosticCollection.set(uri, await validateChangelogTxt(uri)));
	});

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'factorio-locale' }, new LocaleCodeActionProvider()));


	vscode.workspace.findFiles("**/locale/*/*.cfg").then(uris => {
		// check diagnostics
		uris.forEach(async uri=> diagnosticCollection.set(uri, await validateLocale(uri)));
	});

	vscode.workspace.onDidChangeTextDocument(async change =>{
		if (change.document.languageId === "factorio-changelog")
		{
			// if it's changelog.txt, recheck diagnostics...
			diagnosticCollection.set(change.document.uri, await validateChangelogTxt(change.document));
		}
		else if (change.document.languageId === "factorio-locale")
		{
			// if it's changelog.txt, recheck diagnostics...
			diagnosticCollection.set(change.document.uri, await validateLocale(change.document));
		}
	});
	vscode.workspace.onDidDeleteFiles(deleted => {
		deleted.files.forEach(uri=>{diagnosticCollection.set(uri, undefined);});
	});
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{scheme:"file", language:"factorio-changelog"}, new ChangelogDocumentSymbolProvider()));

	context.subscriptions.push(
		vscode.languages.registerColorProvider(
			{scheme:"file", language:"factorio-locale"}, new LocaleColorProvider()));

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{scheme:"file", language:"factorio-locale"}, new LocaleDocumentSymbolProvider()));

	if (vscode.workspace.workspaceFolders) {
		const treeDataProvider = new ModsTreeDataProvider(context);
		const view = vscode.window.createTreeView('factoriomods', { treeDataProvider: treeDataProvider });
		context.subscriptions.push(view);
	}
}

export function deactivate() {
	// nothing to do
}


function translatePath(thispath:string,factorioPath:string):string {
	if (thispath.startsWith("__PATH__executable__"))
		{return path.join(path.dirname(factorioPath),thispath.replace("__PATH__executable__",""));}

	if (thispath.startsWith("__PATH__system-write-data__"))
	{
		// windows: %appdata%/Factorio
		// linux: ~/.factorio
		// mac: ~/Library/Application Support/factorio
		const syswrite =
			os.platform() === "win32" ? path.resolve(process.env.APPDATA!,"Factorio") :
			os.platform() === "linux" ? path.resolve(os.homedir(), ".factorio") :
			os.platform() === "darwin" ? path.resolve(os.homedir(), "Library/Application Support/factorio" ) :
			"??";
		return path.join(syswrite,thispath.replace("__PATH__system-write-data__",""));
	}
	if (thispath.startsWith("__PATH__system-read-data__"))
	{
		// linux: /usr/share/factorio
		// mac: factorioPath/../data
		// else (windows,linuxsteam): factorioPath/../../data
		const sysread =
			os.platform() === "linux" ? "/usr/share/factorio" :
			os.platform() === "darwin" ? path.resolve(path.dirname(factorioPath), "../data" ) :
			path.resolve(path.dirname(factorioPath), "../../data" );

		return path.join(sysread,thispath.replace("__PATH__system-read-data__",""));
	}

	return thispath;
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

class FactorioModConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	async resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration|undefined> {
		// factorio path exists and is a file (and is a binary?)

		if (!config.factorioPath) {
			const factorioPath = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: "Select Factorio binary",
				filters: {
					"": ["exe", ""]
				}
			});
			if (factorioPath)
			{
				config.factorioPath = factorioPath[0].fsPath;
			}
		}

		if(!config.factorioPath){
			vscode.window.showInformationMessage("factorioPath is required");
			return undefined;	// abort launch
		} else if (config.factorioPath.match(/^~[\\\/]/)){
			config.factorioPath = path.posix.join(
				os.homedir().replace(/\\/g,"/"),
				config.factorioPath.replace(/^~[\\\/]/,"") );
		}
		if(!fs.existsSync(config.factorioPath) ){
			vscode.window.showInformationMessage(`factorioPath "${config.factorioPath}" does not exist`);
			return undefined;	// abort launch
		}
		const args:string[] = config.factorioArgs;
		if (args)
		{
			if (args.includes("--config"))
			{
				vscode.window.showInformationMessage("Factorio --config option is set by configPath and should not be included in factorioArgs");
				return undefined;	// abort launch
			}
			if (args.includes("--mod-directory"))
			{
				vscode.window.showInformationMessage("Factorio --mod-directory option is set by modsPath and should not be included in factorioArgs");
				return undefined;	// abort launch
			}
		}

		if (!config.configPath)
		{
			// find config-path.cfg then config.ini and dataPath/modsPath defaults
			const cfgpath = path.resolve(path.dirname(config.factorioPath), "../../config-path.cfg" );
			if (fs.existsSync(cfgpath))
			{
				const configdata = ini.parse(fs.readFileSync(cfgpath,"utf8"));
				config.configPath = path.resolve(
					translatePath(configdata["config-path"],config.factorioPath),
					"./config.ini");
			}
			else
			{
				// try for a config.ini in systemwritepath
				config.configPath = translatePath("__PATH__system-write-data__/config/config.ini",config.factorioPath);
			}
			config.configPathDetected = true;
		} else if (config.configPath.match(/^~[\\\/]/)){
			config.configPath = path.posix.join(
				os.homedir().replace(/\\/g,"/"),
				config.configPath.replace(/^~[\\\/]/,"") );
		}

		if (!fs.existsSync(config.configPath))
		{
			if (config.configPathDetected)
			{
				vscode.window.showInformationMessage("Unable to detect config.ini location. New Factorio install? Try just launching the game directly once first to create one.");
				return undefined;	// abort launch
			}
			else
			{
				vscode.window.showInformationMessage("Specified config.ini not found. New Factorio install? Try just launching the game directly once first to create one.");
				return undefined;	// abort launch
			}
		}

		let configdata:FactorioConfigIni = ini.parse(fs.readFileSync(config.configPath,"utf8"));

		if (configdata?.other?.["cache-prototype-data"])
		{
			const pcache = await vscode.window.showWarningMessage(
				"Prototype Caching is enabled, which usually conflicts with the final portion of debugger initialization (which occurs in settings stage).",
				"Disable in config.ini","Continue anyway"
			);
			if (pcache === "Disable in config.ini")
			{
				let filedata = fs.readFileSync(config.configPath,"utf8");
				filedata = filedata.replace("cache-prototype-data=","; cache-prototype-data=");
				fs.writeFileSync(config.configPath,filedata,"utf8");
				configdata = ini.parse(filedata);
			}
			else if (pcache === undefined)
			{
				return undefined;
			}
		}
		const configDataPath = configdata?.path?.["read-data"];
		if (!configDataPath)
		{
			return vscode.window.showInformationMessage("path.read-data missing in config.ini").then(_ => {
				return undefined;	// abort launch
			});
		}
		config.dataPath = path.posix.normalize(translatePath(configDataPath,config.factorioPath));

		if (config.modsPath)
		{
			config.modsPathSource = "launch";
			let modspath = path.posix.normalize(config.modsPath);
			if (modspath.match(/^~[\\\/]/)){
				modspath = path.posix.join(
					os.homedir().replace(/\\/g,"/"),
					modspath.replace(/^~[\\\/]/,"") );
			}
			if (modspath.match(/[\\\/]$/))
			{
				modspath = modspath.replace(/[\\\/]+$/,"");
			}
			if (fs.existsSync(modspath))
			{
				config.modsPath = modspath;
				if (!fs.existsSync(path.resolve(config.modsPath,"./mod-list.json")))
				{
					const create = await vscode.window.showWarningMessage(
						"modsPath specified in launch configuration does not contain mod-list.json",
						"Create it","Cancel"
					);
					if (create !== "Create it")
					{
						return undefined;	// abort launch
					}
				}
			}
			else
			{
				return vscode.window.showInformationMessage("modsPath specified in launch configuration does not exist").then(_ => {
					return undefined;	// abort launch
				});
			}
		}
		else
		{
			// modsPath not configured: detect from config.ini or mods-list.json in workspace
			const workspaceModLists = await vscode.workspace.findFiles("**/mod-list.json");

			if (workspaceModLists.length === 1)
			{
				// found one, just use it
				config.modsPath = path.dirname(workspaceModLists[0].fsPath);
				config.modsPathSource = "workspace";
			}
			else if (workspaceModLists.length > 1)
			{
				// found more than one. quickpick them.
				config.modsPath = await vscode.window.showQuickPick(
					workspaceModLists.map(ml=>path.dirname(ml.fsPath)),
					{
						placeHolder: "Select mod-list.json to use",
					}
				);
				config.modsPathSource = "workspace";
			}
			else
			{
				// found none. detect from config.ini
				const configModsPath = configdata?.path?.["write-data"];
				if (!configModsPath)
				{
					vscode.window.showInformationMessage("path.write-data missing in config.ini");
					return undefined;	// abort launch
				}

				config.modsPathSource = "config";
				config.modsPath = path.posix.normalize(path.resolve(
					translatePath(configModsPath,config.factorioPath),"mods"));

				if (!fs.existsSync(path.resolve(config.modsPath,"./mod-list.json")))
				{
					const create = await vscode.window.showWarningMessage(
						"modsPath detected from config.ini does not contain mod-list.json",
						"Create it","Cancel"
					);
					if (create !== "Create it")
					{
						return undefined;	// abort launch
					}
				}
			}
		}

		if (os.platform() === "win32" && config.modsPath.startsWith("/")) {config.modsPath = config.modsPath.substr(1);}

		return config;
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(private readonly context: vscode.ExtensionContext) {}

	createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const fmds = new FactorioModDebugSession();
		fmds.setContext(this.context);
		return new vscode.DebugAdapterInlineImplementation(fmds);
	}

	dispose()
	{

	}
}

