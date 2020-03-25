'use strict';
import * as vscode from 'vscode';
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
			return new vscode.Color(parseInt(matches[1], 16), parseInt(matches[2], 16), parseInt(matches[3], 16), matches[4] ? parseInt(matches[4], 16) : 255);
		}
	}
	;
	padHex(i: number): string {
		let hex = Math.floor(i).toString(16);
		if (hex.length < 2) {
			hex = "0" + hex;
		}
		return hex;
	}
	colorToString(color: vscode.Color): string {
		return `#${this.padHex(color.red * 255)}${this.padHex(color.green * 255)}${this.padHex(color.blue * 255)}${color.alpha < 1 ? this.padHex(color.alpha * 255) : ""}`;
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
		let p = new vscode.ColorPresentation(this.colorToString(color));
		p.textEdit = new vscode.TextEdit(context.range, this.colorToString(color));
		return [p];
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

