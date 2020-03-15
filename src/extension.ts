'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as ini from 'ini';
import { FactorioModDebugSession } from './factorioModDebug';
import { LocaleColorProvider, LocaleDocumentSymbolProvider } from './LocaleLangProvider';
import { ChangelogCodeActionProvider, validateChangelogTxt, ChangelogDocumentSymbolProvider } from './ChangeLogLangProvider';
import { ModsTreeDataProvider } from './ModPackageProvider';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	const provider = new FactorioModConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

	// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
	let factory = new InlineDebugAdapterFactory();

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
	context.subscriptions.push(factory);


	diagnosticCollection = vscode.languages.createDiagnosticCollection('factorio-changelog');
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ scheme: 'file', language: 'factorio-changelog' }, new ChangelogCodeActionProvider()));

	vscode.workspace.findFiles("**/changelog.txt").then(uris => {
		// check diagnostics
		uris.forEach(async uri=> diagnosticCollection.set(uri, await validateChangelogTxt(uri)));
	});

	vscode.workspace.onDidChangeTextDocument(async change =>{
		if (change.document.languageId === "factorio-changelog")
		{
			// if it's changelog.txt, recheck diagnostics...
			diagnosticCollection.set(change.document.uri, await validateChangelogTxt(change.document));
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
		let treeDataProvider = new ModsTreeDataProvider(context);
		const view_exp = vscode.window.createTreeView('factoriomods_exp', { treeDataProvider: treeDataProvider });
		context.subscriptions.push(view_exp);
		const view_scm = vscode.window.createTreeView('factoriomods_scm', { treeDataProvider: treeDataProvider });
		context.subscriptions.push(view_scm);
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

class FactorioModConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
		// factorio path exists and is a file (and is a binary?)
		if (!config.factorioPath || !fs.existsSync(config.factorioPath) ){
			return vscode.window.showInformationMessage("factorioPath is required").then(_ => {
				return undefined;	// abort launch
			});
		}
		const args:string[] = config.factorioArgs;
		if (args)
		{
			if (args.includes("--config"))
				{return vscode.window.showInformationMessage("Factorio --config option is set by configPath and should not be included in factorioArgs").then(_ => {
					return undefined;	// abort launch
				});}
			if (args.includes("--mod-directory"))
				{return vscode.window.showInformationMessage("Factorio --mod-directory option is set by modsPath and should not be included in factorioArgs").then(_ => {
					return undefined;	// abort launch
				});}
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
		}

		if (!fs.existsSync(config.configPath))
		{
			if (config.configPathDetected)
				{return vscode.window.showInformationMessage("Unabled to detect config.ini location").then(_ => {
					return undefined;	// abort launch
				});}

			return vscode.window.showInformationMessage("Specified config.ini not found").then(_ => {
				return undefined;	// abort launch
			});
		}

		const configdata = ini.parse(fs.readFileSync(config.configPath,"utf8"));

		config.dataPath = path.posix.normalize(translatePath(configdata.path["read-data"],config.factorioPath));

		if (config.modsPath)
		{
			let modspath = path.posix.normalize(config.modsPath);
			if (modspath.endsWith("/") || modspath.endsWith("\\"))
			{
				modspath = modspath.replace(/[\\\/]+$/,"");
			}
			if (fs.existsSync(modspath))
			{
				config.modsPath = modspath;
			}
		}
		else
		{
			config.modsPathDetected = true;
			config.modsPath = path.posix.normalize(path.resolve(
				translatePath(configdata.path["write-data"],config.factorioPath),"mods"));
		}

		return config;
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new FactorioModDebugSession());
	}

	dispose()
	{

	}
}

