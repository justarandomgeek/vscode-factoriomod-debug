'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FactorioModDebugSession } from './factorioModDebug';
import { LocaleColorProvider, LocaleDocumentSymbolProvider } from './LocaleLangProvider';
import { ChangelogCodeActionProvider, validateChangelogTxt, ChangelogDocumentSymbolProvider } from './ChangeLogLangProvider';

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
		uris.forEach(async uri=> diagnosticCollection.set(uri, await validateChangelogTxt(uri)))
	})

	vscode.workspace.onDidChangeTextDocument(async change =>{
		if (change.document.languageId == "factorio-changelog")
		{
			// if it's changelog.txt, recheck diagnostics...
			diagnosticCollection.set(change.document.uri, await validateChangelogTxt(change.document))
		}
	})
	vscode.workspace.onDidDeleteFiles(deleted => {
		deleted.files.forEach(uri=>{diagnosticCollection.set(uri, undefined)})
	})
	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{scheme:"file", language:"factorio-changelog"}, new ChangelogDocumentSymbolProvider()));

	context.subscriptions.push(
		vscode.languages.registerColorProvider(
			{scheme:"file", language:"factorio-locale"}, new LocaleColorProvider()));

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(
			{scheme:"file", language:"factorio-locale"}, new LocaleDocumentSymbolProvider()));

}

export function deactivate() {
	// nothing to do
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

		if (config.dataPath)
		{
			let dataPath = path.posix.normalize(config.dataPath);
			if (dataPath.endsWith("/") || dataPath.endsWith("\\"))
			{
				dataPath = dataPath.replace(/[\\\/]+$/,"")
			}
		}
		else
		{
			// if data path is not set, assume factorio path dir/../../data, verify dir exists
			if (os.platform() == "darwin")
			{
				// except on macs, then it's only one layer...
				config.dataPath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../data" ));
			}
			else
			{
				config.dataPath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../../data" ));
			}
		}

		if (config.modsPath)
		{
			let modspath = path.posix.normalize(config.modsPath);
			if (modspath.endsWith("/") || modspath.endsWith("\\"))
			{
				modspath = modspath.replace(/[\\\/]+$/,"")
			}
			if (fs.existsSync(modspath))
			{
				config.modsPath = modspath;
			}
		}
		// if mods path is not set, assume factorio path dir/../../mods, verify dir exists
		// except on macs, it's not there.
		else if (os.platform() != "darwin")
		{
			const modspath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../../mods" ));
			if (fs.existsSync(modspath))
			{
				config.modsPath = modspath;
			}
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

