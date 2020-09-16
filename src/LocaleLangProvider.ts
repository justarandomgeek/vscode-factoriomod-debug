'use strict';
import * as vscode from 'vscode';

export async function validateLocale(document: vscode.Uri|vscode.TextDocument): Promise<vscode.Diagnostic[]> {
	if (document instanceof vscode.Uri)
	{
		document = await vscode.workspace.openTextDocument(document);
	}
	const locale = document.getText().split(/\r?\n/);
	const diags: vscode.Diagnostic[] = [];


	let currentSection:string|undefined;
	const sections = new Map<string|undefined,Set<String>>();
	sections.set(undefined,new Set<string>());
	for (let i = 0; i < locale.length; i++) {
		const line = locale[i];
		if (line.match(/^[ \r\t]*[#;]/))
		{
			// nothing to check in comments
		}
		else if(line.match(/^[ \r\t]*\[/))
		{
			const secname = line.match(/^[ \r\t]*\[([^\[]+)\][ \r\t]*$/);
			if(secname)
			{
				// save current category, check for duplicates
				currentSection = secname[1];
				if (sections.has(currentSection))
				{
					diags.push({
						"message": "Duplicate Section",
						"source": "factorio-locale",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, line.indexOf(currentSection), i, line.indexOf(currentSection)+currentSection.length)
					});
				}
				else if (sections.get(undefined)!.has(currentSection))
				{
					diags.push({
						"message": "Section Name conflicts with Key in Root",
						"source": "factorio-locale",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, line.indexOf(currentSection), i, line.indexOf(currentSection)+currentSection.length)
					});
					sections.set(currentSection,new Set<String>());
				}
				else
				{
					sections.set(currentSection,new Set<String>());
				}
			}
			else
			{
				diags.push({
					"message": "Invalid Section Header",
					"source": "factorio-locale",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
			}
		}
		else if (line.trim().length > 0)
		{
			const keyval = line.match(/^[ \r\t]*([^=]*)=(.*)$/);
			if (keyval)
			{
				const key = keyval[1];
				if (sections.get(currentSection)!.has(key))
				{
					diags.push({
						"message": "Duplicate Key",
						"source": "factorio-locale",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, line.indexOf(key), i, line.indexOf(key)+key.length)
					});
				}
				else
				{
					sections.get(currentSection)!.add(key);
				}
				//TODO: validate tags in value (keyval[2])
			}
			else
			{
				diags.push({
					"message": "Invalid Key",
					"source": "factorio-locale",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
			}
		}
	}
	return diags;
}

export class LocaleColorProvider implements vscode.DocumentColorProvider {
	constColors = new Map([
		["default", new vscode.Color(1.000, 0.630, 0.259, 1)],
		["red", new vscode.Color(1.000, 0.166, 0.141, 1)],
		["green", new vscode.Color(0.173, 0.824, 0.250, 1)],
		["blue", new vscode.Color(0.343, 0.683, 1.000, 1)],
		["orange", new vscode.Color(1.000, 0.630, 0.259, 1)],
		["yellow", new vscode.Color(1.000, 0.828, 0.231, 1)],
		["pink", new vscode.Color(1.000, 0.520, 0.633, 1)],
		["purple", new vscode.Color(0.821, 0.440, 0.998, 1)],
		["white", new vscode.Color(0.9, 0.9, 0.9, 1)],
		["black", new vscode.Color(0.5, 0.5, 0.5, 1)],
		["gray", new vscode.Color(0.7, 0.7, 0.7, 1)],
		["brown", new vscode.Color(0.757, 0.522, 0.371, 1)],
		["cyan", new vscode.Color(0.335, 0.918, 0.866, 1)],
		["acid", new vscode.Color(0.708, 0.996, 0.134, 1)]
	]);
	colorFromString(str: string): vscode.Color | undefined {
		// color name from utility constants
		if (this.constColors.has(str))
			{return this.constColors.get(str);}
		// #rrggbb or #rrggbbaa
		if (str.startsWith("#")) {
			let matches = str.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/);
			if (matches) {
				return new vscode.Color(parseInt(matches[1], 16) / 255, parseInt(matches[2], 16) / 255, parseInt(matches[3], 16) / 255, matches[4] ? parseInt(matches[4], 16) / 255 : 1);
			}
		}
		// r,g,b as int 1-255 or float 0-1
		let matches = str.match(/\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*,?\s*(\d+(?:\.\d+)?))?\s*/);
		if (matches) {
			let r = parseFloat(matches[1]);
			let g = parseFloat(matches[2]);
			let b = parseFloat(matches[3]);
			let a = matches[4] ? parseFloat(matches[4]) : undefined;
			if (r>1 || g>1 || b>1 || a && a>1)
			{
				r = r/255;
				g = g/255;
				b = b/255;
				if (a)
				{
					a = a/255;
				}
			}
			if (!a)
			{
				a = 1;
			}
			return new vscode.Color(r,g,b,a);
		}

		return undefined;
	}
	padHex(i: number): string {
		let hex = Math.floor(i).toString(16);
		if (hex.length < 2) {
			hex = "0" + hex;
		}
		return hex;
	}

	roundTo(f:number,places:number):number {
		return Math.round(f*Math.pow(10,places))/Math.pow(10,places);
	}
	colorToStrings(color: vscode.Color): string[] {
		let names:string[] = [];
		for (const [constname,constcolor] of this.constColors) {
			if (Math.abs(constcolor.red-color.red) < 0.004 &&
				Math.abs(constcolor.green-color.green) < 0.004 &&
				Math.abs(constcolor.blue-color.blue) < 0.004 &&
				Math.abs(constcolor.alpha-color.alpha) < 0.004)
			{
				names.push(constname);
				break;
			}
		}

		if (color.alpha > 0.996)
		{
			names.push(`#${this.padHex(color.red * 255)}${this.padHex(color.green * 255)}${this.padHex(color.blue * 255)}`);
			names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}`);
			names.push(`${this.roundTo(color.red,3)}, ${this.roundTo(color.green,3)}, ${this.roundTo(color.blue,3)}`);
		}
		else
		{
			names.push(`#${this.padHex(color.red * 255)}${this.padHex(color.green * 255)}${this.padHex(color.blue * 255)}${this.padHex(color.alpha * 255)}`);
			names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}, ${Math.floor(color.alpha * 255)}`);
			names.push(`${this.roundTo(color.red,3)}, ${this.roundTo(color.green,3)}, ${this.roundTo(color.blue,3)}, ${this.roundTo(color.alpha,3)}`);
		}

		return names;
	}
	public provideDocumentColors(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ColorInformation[] {
		let colors: vscode.ColorInformation[] = [];
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i);
			let re = /\[color=([^\]]+)\]/g;
			let matches = re.exec(element.text);
			while (matches) {
				//if (matches[1])
				{
					let color = this.colorFromString(matches[1]);
					if (color) {
						colors.push(new vscode.ColorInformation(new vscode.Range(i, matches.index + 7, i, matches.index + 7 + matches[1].length), color));
					}
				}
				matches = re.exec(element.text);
			}
		}
		return colors;
	}
	public provideColorPresentations(color: vscode.Color, context: {
		document: vscode.TextDocument
		range: vscode.Range
	}, token: vscode.CancellationToken): vscode.ColorPresentation[] {
		return this.colorToStrings(color).map(colorstring=>{
			let p = new vscode.ColorPresentation(colorstring);
			p.textEdit = new vscode.TextEdit(context.range, colorstring);
			return p;
		});
	}
}
export class LocaleDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentSymbol[] {
		let symbols: vscode.DocumentSymbol[] = [];
		let category: vscode.DocumentSymbol | undefined;
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i);
			if (element.text.match(/^\[([^\]])+\]$/)) {
				category = new vscode.DocumentSymbol(element.text.substr(1, element.text.length - 2), "", vscode.SymbolKind.Namespace, element.range, new vscode.Range(element.range.start.translate(0, 1), element.range.end.translate(0, -1)));
				symbols.push(category);
			}
			else if(element.text.match(/^[#;]/))
			{
				// nothing to do for comments...
			}
			else {
				let matches = element.text.match(/^([^=]+)=(.+)$/);
				if (matches) {
					let s = new vscode.DocumentSymbol(matches[1], matches[2], vscode.SymbolKind.String, element.range, new vscode.Range(element.range.start, element.range.start.translate(0, matches[2].length)));
					if (category) {
						category.children.push(s);
						category.range = category.range.union(element.range);
					}
				}
			}
		}
		return symbols;
	}
}

