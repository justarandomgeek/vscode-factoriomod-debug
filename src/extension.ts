'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { FactorioModDebugSession } from './factorioModDebug';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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

	vscode.workspace.findFiles("**/changelog.txt").then(uris => {
		// check diagnostics
		uris.forEach(uri=> diagnosticCollection.set(uri, validateChangelogTxt(uri)))
	})

	vscode.workspace.onDidChangeTextDocument(change =>{
		if (change.document.languageId == "factorio-changelog")
		{
			// if it's changelog.txt, recheck diagnostics...
			diagnosticCollection.set(change.document.uri, validateChangelogTxt(change.document.uri))
		}
	})
}

export function deactivate() {
	// nothing to do
}

function validateChangelogTxt(uri:vscode.Uri): vscode.Diagnostic[]
{
	const changelog = fs.readFileSync(uri.fsPath, "utf8").split(/\r?\n/);


	let diags:vscode.Diagnostic[] = []
	let seenStart = false
	let seenStartLast = false
	let seenDate = false
	let seenCategory = false
	for (let i = 0; i < changelog.length; i++) {
		let line = changelog[i];
		if (line.match(/^-+$/))
		{
			if (line.length != 99)
			diags.push({
				"message": "Separator line is incorrect length",
				"source": "factorio-changelog",
				"severity": vscode.DiagnosticSeverity.Error,
				"range": new vscode.Range(i,0,i,line.length)
			})
			line = changelog[++i];
			if(!line)
			{
				diags.push({
					"message": "Unexpected separator line at end of file",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i-1,0,i-1,changelog[i-1].length)
				})
			}
			else if (!line.startsWith("Version: "))
			{
				diags.push({
					"message": "Expected version on first line of block",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i,0,i,line.length)
				})
			}
			else if (!line.match(/^Version: \d+.\d+(.\d+)?/))
			{
				diags.push({
					"message": "Expected at least two numbers in version string",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i,9,i,line.length)
				})
			}
			seenStart = true
			seenStartLast = true
			seenDate = false
			seenCategory = false
		}
		else if (seenStart)
		{
			if(line.startsWith("Version: "))
			{
				diags.push({
					"message": "Duplicate version line - missing separator?",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i,0,i,line.length)
				})
				seenStartLast = true
				seenDate = false
				seenCategory = false
			}
			else if(line.startsWith("Date: "))
			{
				if(seenDate){
					diags.push({
						"message": "Duplicate date line",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i,0,i,line.length)
					})
				}
				else if(!seenStartLast)
				{
					diags.push({
						"message": "Date line not immediately after version line",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Warning,
						"range": new vscode.Range(i,0,i,line.length)
					})
					seenDate = true
				}
				else
				{
					seenDate = true
				}
				seenStartLast = false
			}
			else if(line.match(/^  [^ ]/))
			{
				seenStartLast = false
				seenCategory = true
				if (!line.endsWith(":"))
				{
					diags.push({
						"message": "Category line must end with :",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i,line.length-1,i,line.length)
					})
				}
				if(!line.match(/^  (((Major|Minor) )?Features|Graphics|Sounds|Optimi[sz]ations|(Combat )?Balancing|Circuit Network|Changes|Bugfixes|Modding|Scripting|Gui|Control|Translation|Debug|Ease of use|Info|Locale|Other):?$/))
				{
					diags.push({
						"message": "Non-standard category names will be placed after \"All\"",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Information,
						"range": new vscode.Range(i,2,i,line.length-1)
					})
				}
			}
			else if(line.startsWith("    [- ] "))
			{
				seenStartLast = false
				if (!seenCategory)
				{
					diags.push({
						"message": "Entry not in category",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i,0,i,line.length)
					})
				}
			}
		}
		else
		{
			diags.push({
				"message": "Unrecognized line format or line not in valid block",
				"source": "factorio-changelog",
				"severity": vscode.DiagnosticSeverity.Error,
				"range": new vscode.Range(i,0,i,line.length)
			})
		}
	}
	return diags
}


class FactorioModConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
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

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new FactorioModDebugSession());
	}

	dispose()
	{

	}
}
