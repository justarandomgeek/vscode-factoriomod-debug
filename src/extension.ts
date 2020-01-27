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
			diagnosticCollection.set(change.document.uri, await validateChangelogTxt(change.document.uri))
		}
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

async function validateChangelogTxt(uri:vscode.Uri): Promise<vscode.Diagnostic[]>
{
	const changelog = (await vscode.workspace.fs.readFile(uri)).toString().split(/\r?\n/)

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
				"code": "separator.fixlength",
				"source": "factorio-changelog",
				"severity": vscode.DiagnosticSeverity.Error,
				"range": new vscode.Range(i,0,i,line.length)
			})
			line = changelog[++i];
			if(!line)
			{
				diags.push({
					"message": "Unexpected separator line at end of file",
					"code": "separator.remove",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i-1,0,i-1,changelog[i-1].length)
				})
			}
			else if (!line.startsWith("Version: "))
			{
				diags.push({
					"message": "Expected version on first line of block",
					"code": "version.insert",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i,0,i,line.length)
				})
			}
			else if (!line.match(/^Version: \d+.\d+(.\d+)?/))
			{
				diags.push({
					"message": "Expected at least two numbers in version string",
					"code": "version.numbers",
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
					"code": "separator.insert",
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
						"code": "category.fixend",
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
			else if(line.match(/^    [- ] /))
			{
				seenStartLast = false
				if (!seenCategory)
				{
					diags.push({
						"message": "Entry not in category",
						"code": "category.insert",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i,0,i,line.length)
					})
				}
			}
			else if(line.length > 0)
			{
				diags.push({
					"message": "Unrecognized line format",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i,0,i,line.length)
				})
			}
		}
		else
		{
			diags.push({
				"message": "Line not in valid block",
				"source": "factorio-changelog",
				"severity": vscode.DiagnosticSeverity.Error,
				"range": new vscode.Range(i,0,i,line.length)
			})
		}
	}
	return diags
}

class ChangelogCodeActionProvider implements vscode.CodeActionProvider {
	public provideCodeActions(
		document: vscode.TextDocument, range: vscode.Range,
		context: vscode.CodeActionContext, token: vscode.CancellationToken):
		vscode.CodeAction[]
	{
		if (document.languageId == "factorio-changelog")
		{
			return context.diagnostics.filter(diag => !!diag.code).map((diag) =>{
				switch (diag.code) {
					case "separator.fixlength":
					{
						let ca = new vscode.CodeAction("Fix separator Length", vscode.CodeActionKind.QuickFix.append("separator").append("fixlength"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(diag.range,"---------------------------------------------------------------------------------------------------")
							])
						return ca
					}
					case "separator.insert":
					{
						let ca = new vscode.CodeAction("Insert separator", vscode.CodeActionKind.QuickFix.append("separator").append("insert"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(new vscode.Range(diag.range.start,diag.range.start),
									"---------------------------------------------------------------------------------------------------\n")
							])
						return ca
					}
					case "separator.remove":
					{
						let ca = new vscode.CodeAction("Remove separator", vscode.CodeActionKind.QuickFix.append("separator").append("remove"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(diag.range,"")
							])
						return ca
					}
					case "version.insert":
					{
						let ca = new vscode.CodeAction("Insert version", vscode.CodeActionKind.QuickFix.append("version").append("insert"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(new vscode.Range(diag.range.start,diag.range.start) ,"Version: 0.0.0 ")
							])
						return ca
					}
					case "version.numbers":
					{
						let ca = new vscode.CodeAction("Insert version", vscode.CodeActionKind.QuickFix.append("version").append("numbers"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(new vscode.Range(diag.range.start,diag.range.start) ,"0.0.0 ")
							])
						return ca
					}
					case "category.fixend":
					{
						let ca = new vscode.CodeAction("Insert :", vscode.CodeActionKind.QuickFix.append("category").append("fixend"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(new vscode.Range(diag.range.end,diag.range.end) ,":")
							])
						return ca
					}
					case "category.insert":
					{
						let ca = new vscode.CodeAction("Insert category", vscode.CodeActionKind.QuickFix.append("category").append("insert"))
						ca.diagnostics = [diag]
						ca.edit = new vscode.WorkspaceEdit()
						ca.edit.set(document.uri,
							[
								new vscode.TextEdit(new vscode.Range(diag.range.start,diag.range.start) ,"  Changes:\n")
							])
						return ca
					}
					default:
						return new vscode.CodeAction("Dummy", vscode.CodeActionKind.Empty)
				}
			}).filter(diag => !(diag.kind && diag.kind.intersects(vscode.CodeActionKind.Empty)) )
		}
		return []
	}
}

class ChangelogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken):vscode.DocumentSymbol[]
	{
		let symbols:vscode.DocumentSymbol[] = []
		let version:vscode.DocumentSymbol|undefined
		let category:vscode.DocumentSymbol|undefined
		let line:vscode.DocumentSymbol|undefined
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i)
			if (element.text.match(/^Version: .+$/)) {

				version = new vscode.DocumentSymbol(
					element.text.substr(9,element.text.length),
					"",
					vscode.SymbolKind.Namespace,
					element.range.with(element.range.start.translate(-1,0)),
					element.range.with(element.range.start.translate(0,9))
					)
				symbols.push(version)
				category = undefined
				line = undefined
			}
			else if (element.text.match(/^Date: .+$/)) {
				if(version)
				{
					version.children.push(new vscode.DocumentSymbol(
						"Date",
						element.text.substr(6,element.text.length),
						vscode.SymbolKind.Property,
						element.range,
						element.range.with(element.range.start.translate(0,6))
						))
					version.range = version.range.union(element.range)
				}
			}
			else if (element.text.match(/^  [^ ]+:$/)) {
				if(version)
				{
					category = new vscode.DocumentSymbol(
						element.text.substr(2,element.text.length-2),
						"",
						vscode.SymbolKind.Class,
						element.range,
						element.range.with(element.range.start.translate(0,2),element.range.end.translate(0,-1))
						)
					version.children.push(category)
					version.range = version.range.union(element.range)
					line = undefined
				}
			}
			else if (element.text.match(/^    - .+$/)) {
				if(category)
				{
					line = new vscode.DocumentSymbol(
						element.text.substr(6,element.text.length),
						"",
						vscode.SymbolKind.String,
						element.range,
						element.range.with(element.range.start.translate(0,6))
						)
					category.children.push(line)
					category.range = category.range.union(element.range)
				}
			}
			else if (element.text.match(/^      .+$/)) {
				if(line)
				{
					line.children.push(new vscode.DocumentSymbol(
						element.text.substr(6,element.text.length),
						"",
						vscode.SymbolKind.String,
						element.range,
						element.range.with(element.range.start.translate(0,6))
						))
					line.range = line.range.union(element.range)
				}
			}
		}
		return symbols
	}
}


class LocaleColorProvider implements vscode.DocumentColorProvider {
	constColors = new Map([
		["default", new vscode.Color(1.000, 0.630, 0.259, 1)],
		["red",     new vscode.Color(1.000, 0.166, 0.141, 1)],
		["green",   new vscode.Color(0.173, 0.824, 0.250, 1)],
		["blue",    new vscode.Color(0.343, 0.683, 1.000, 1)],
		["orange",  new vscode.Color(1.000, 0.630, 0.259, 1)],
		["yellow",  new vscode.Color(1.000, 0.828, 0.231, 1)],
		["pink",    new vscode.Color(1.000, 0.520, 0.633, 1)],
		["purple",  new vscode.Color(0.821, 0.440, 0.998, 1)],
		["white",   new vscode.Color(0.9  , 0.9  , 0.9  , 1)],
		["black",   new vscode.Color(0.5  , 0.5  , 0.5  , 1)],
		["gray",    new vscode.Color(0.7  , 0.7  , 0.7  , 1)],
		["brown",   new vscode.Color(0.757, 0.522, 0.371, 1)],
		["cyan",    new vscode.Color(0.335, 0.918, 0.866, 1)],
		["acid",    new vscode.Color(0.708, 0.996, 0.134, 1)]
	]);

	colorFromString(str:string):vscode.Color|undefined
	{
		// color name from utility constants
		if (this.constColors.has(str)) return this.constColors.get(str)
		// #rrggbb or #rrggbbaa
		if (str.startsWith("#"))
		{
			let matches = str.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/)
			if(matches){
				return new vscode.Color(
					parseInt(matches[1],16)/255,
					parseInt(matches[2],16)/255,
					parseInt(matches[3],16)/255,
					matches[4] ? parseInt(matches[4],16)/255 : 1
				)
			}
		}
		// r,g,b as int 1-255 or float 0-1
		let matches = str.match(/\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*,?\s*(\d+(?:\.\d+)?))?\s*/)
			if(matches){
				return new vscode.Color(
					parseInt(matches[1],16),
					parseInt(matches[2],16),
					parseInt(matches[3],16),
					matches[4] ? parseInt(matches[4],16) : 255
				)
			}

	};

	padHex(i:number):string
	{
		var hex = Math.floor(i).toString(16);
		if (hex.length < 2) {
			 hex = "0" + hex;
		}
		return hex;
	}

	colorToString(color:vscode.Color):string
	{
		return `#${this.padHex(color.red * 255)}${this.padHex(color.green * 255)}${this.padHex(color.blue * 255)}${color.alpha < 1 ?this.padHex(color.alpha * 255): "" }`
	}

	public provideDocumentColors(document: vscode.TextDocument, token: vscode.CancellationToken):vscode.ColorInformation[]
	{
		let colors:vscode.ColorInformation[] = []
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i)

			let re = /\[color=([^\]]+)\]/g
			let matches = re.exec(element.text)
			while (matches) {
				//if (matches[1])
				{
					let color = this.colorFromString(matches[1])

					if (color)
					{
						colors.push(new vscode.ColorInformation(
							new vscode.Range(i,matches.index+7,i,matches.index + 7 + matches[1].length),
							color
						))
					}
				}
				matches = re.exec(element.text)
			}
		}
		return colors
	}
	public provideColorPresentations(
		color: vscode.Color, context: { document: vscode.TextDocument, range: vscode.Range }, token: vscode.CancellationToken):
		vscode.ColorPresentation[] {
		let p = new vscode.ColorPresentation(this.colorToString(color))
		p.textEdit = new vscode.TextEdit(
				context.range,
				this.colorToString(color)
			)
		return [p]
	}
}

class LocaleDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken):vscode.DocumentSymbol[]
	{
		let symbols:vscode.DocumentSymbol[] = []
		let category:vscode.DocumentSymbol|undefined
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i)
			if (element.text.match(/^\[([^\]])+\]$/)) {
				category = new vscode.DocumentSymbol(
					element.text.substr(1,element.text.length-2),
					"",
					vscode.SymbolKind.Namespace,
					element.range,
					new vscode.Range(element.range.start.translate(0,1),element.range.end.translate(0,-1))
					)
				symbols.push(category)
			}
			else {
				let matches = element.text.match(/^([^=]+)=(.+)$/)
				if (matches) {
					let s = new vscode.DocumentSymbol(
						matches[1],
						matches[2],
						vscode.SymbolKind.String,
						element.range,
						new vscode.Range(element.range.start,element.range.start.translate(0,matches[2].length))
						)
					if(category){
						category.children.push(s)
						category.range = category.range.union(element.range)
					}
				}

			}
		}
		return symbols
	}
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

