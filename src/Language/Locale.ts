import {
	CodeAction,
	CodeActionContext,
	CodeActionKind,
	Diagnostic,
	DiagnosticSeverity,
	DocumentSymbol,
	SymbolKind,
	Range,
	_Connection,
	Color,
	ColorInformation,
	ColorPresentation,
} from 'vscode-languageserver/node';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

interface DuplicateDefinitionDiagnostic extends Diagnostic {
	data: {
		firstsym: DocumentSymbol
		newsym: DocumentSymbol
	}
}

export async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	const locale = textDocument.getText().split(/\r?\n/);
	const diags: Diagnostic[] = [];

	const symbols = provideDocumentSymbols(textDocument);

	let currentSection:string|undefined;
	const sections = new Map<string|undefined, Set<String>>();
	sections.set(undefined, new Set<string>());
	for (let i = 0; i < locale.length; i++) {
		const line = locale[i];
		if (line.match(/^[ \r\t]*[#;]/)) {
			// nothing to check in comments
		} else if (line.match(/^[ \r\t]*\[/)) {
			const secname = line.match(/^[ \r\t]*\[([^\[]+)\][ \r\t]*$/);
			if (secname) {
				// save current category, check for duplicates
				currentSection = secname[1];
				if (sections.has(currentSection)) {
					const matching = symbols.filter(sym=>sym.name === currentSection);
					const previous = matching.reduce((syma, symb)=>syma.range.start.line < symb.range.start.line?syma:symb);
					const newsym = matching.find(sym=>sym.range.start.line === i);
					diags.push(<DuplicateDefinitionDiagnostic>{
						message: "Duplicate Section",
						source: "factorio-locale",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: line.indexOf(currentSection) }, end: { line: i, character: line.indexOf(currentSection)+currentSection.length }},
						relatedInformation: [{
							location: {
								uri: textDocument.uri,
								range: previous.range,
							},
							message: "First defined here",
						}],
						code: "section.merge",
						data: {
							firstsym: previous,
							newsym: newsym,
						},
					});
				} else if (sections.get(undefined)!.has(currentSection)) {
					const matching = symbols.filter(sym=>sym.name === currentSection);
					const previous = matching.reduce((syma, symb)=>syma.range.start.line < symb.range.start.line?syma:symb);
					diags.push({
						message: "Section Name conflicts with Key in Root",
						source: "factorio-locale",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: line.indexOf(currentSection) }, end: { line: i, character: line.indexOf(currentSection)+currentSection.length }},
						relatedInformation: [{
							location: {
								uri: textDocument.uri,
								range: previous.range,
							},
							message: "First defined here",
						}],
					});
					sections.set(currentSection, new Set<String>());
				} else {
					sections.set(currentSection, new Set<String>());
				}
			} else {
				diags.push({
					message: "Invalid Section Header",
					source: "factorio-locale",
					severity: DiagnosticSeverity.Error,
					range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
				});
			}
		} else if (line.trim().length > 0) {
			const keyval = line.match(/^[ \r\t]*([^=]*)=(.*)$/);
			if (keyval) {
				const key = keyval[1];
				if (sections.get(currentSection)!.has(key)) {
					const previous = symbols
						.filter(sym=>sym.name === currentSection && sym.kind === SymbolKind.Namespace)
						.map(sym=>sym.children?.filter(sym=>sym.name === key)??[])
						.reduce(
							(a, b)=>a.concat(b),
							symbols.filter(sym=>sym.name === key && sym.kind === SymbolKind.String)
						)
						.reduce((syma, symb)=>syma.range.start.line < symb.range.start.line?syma:symb);
					diags.push({
						message: "Duplicate Key",
						source: "factorio-locale",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: line.indexOf(key) }, end: { line: i, character: line.indexOf(key)+key.length }},
						relatedInformation: [{
							location: {
								uri: textDocument.uri,
								range: previous.range,
							},
							message: "First defined here",
						}],

					});
				} else {
					sections.get(currentSection)!.add(key);
				}
				//TODO: validate tags in value (keyval[2])
			} else {
				diags.push({
					message: "Invalid Key",
					source: "factorio-locale",
					severity: DiagnosticSeverity.Error,
					range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
				});
			}
		}
	}
	return diags;
}


export function provideDocumentSymbols(document: TextDocument): DocumentSymbol[] {
	const symbols: DocumentSymbol[] = [];
	let category: DocumentSymbol | undefined;

	for (let i = 0; i < document.lineCount; i++) {
		const range = {start: { line: i, character: 0 }, end: { line: i, character: Infinity} };
		const text = document.getText(range).replace(/(\r\n)|\r|\n$/, "");
		range.end.character = text.length;

		if (text.match(/^\[([^\]])+\]$/)) {
			category = {
				name: text.substring(1, text.length - 1),
				detail: "",
				kind: SymbolKind.Namespace,
				range: range,
				selectionRange: {start: { line: i, character: 1 }, end: { line: i, character: text.length-1} },
				children: [],
			};
			symbols.push(category);
		} else if (text.match(/^[#;]/)) {
			// nothing to do for comments...
		} else {
			const matches = text.match(/^([^=]+)=(.+)$/);
			if (matches) {
				const s = {
					name: matches[1],
					detail: matches[2],
					kind: SymbolKind.String,
					range: range,
					selectionRange: {start: { line: i, character: matches[1].length + 1 }, end: { line: i, character: text.length} },
					children: [],
				};
				if (category) {
					category.children!.push(s);
					category.range.end = range.end;
				} else {
					symbols.push(s);
				}
			}
		}
	}
	return symbols;
}

export function provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
	if (document.languageId === "factorio-locale") {
		return context.diagnostics.filter(diag=>!!diag.code).map((diag)=>{
			switch (diag.code) {
				case "section.merge":
				{
					const dupediag = <DuplicateDefinitionDiagnostic>diag;
					const insertAt = dupediag.data!.firstsym.range.end;

					const ca:CodeAction = {
						title: "Merge Sections",
						kind: CodeActionKind.QuickFix + ".section.merge",
						diagnostics: [diag],
						edit: {
							changes: {
								[document.uri]: [
									{
										range: dupediag.data!.newsym.range,
										newText: "",

									},
									{
										range: {start: insertAt, end: insertAt},
										newText: document.getText(
											{
												start: { line: dupediag.data!.newsym.selectionRange.end.line, character: dupediag.data!.newsym.selectionRange.end.character+1 },
												end: dupediag.data!.newsym.range.end,
											},
										),
									},
								],
							},
						},
					};
					return ca;
				}
				default:
					return undefined;
			}
		}).filter((ca):ca is CodeAction=>!!ca);
	}
	return [];
}

const constColors = new Map<string, Color>([
	["default", { red: 1.000, green: 0.630, blue: 0.259, alpha: 1 }],
	["red", { red: 1.000, green: 0.166, blue: 0.141, alpha: 1 }],
	["green", { red: 0.173, green: 0.824, blue: 0.250, alpha: 1 }],
	["blue", { red: 0.343, green: 0.683, blue: 1.000, alpha: 1 }],
	["orange", { red: 1.000, green: 0.630, blue: 0.259, alpha: 1 }],
	["yellow", { red: 1.000, green: 0.828, blue: 0.231, alpha: 1 }],
	["pink", { red: 1.000, green: 0.520, blue: 0.633, alpha: 1 }],
	["purple", { red: 0.821, green: 0.440, blue: 0.998, alpha: 1 }],
	["white", { red: 0.9, green: 0.9, blue: 0.9, alpha: 1 }],
	["black", { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 }],
	["gray", { red: 0.7, green: 0.7, blue: 0.7, alpha: 1 }],
	["brown", { red: 0.757, green: 0.522, blue: 0.371, alpha: 1 }],
	["cyan", { red: 0.335, green: 0.918, blue: 0.866, alpha: 1 }],
	["acid", { red: 0.708, green: 0.996, blue: 0.134, alpha: 1 }],
]);
function colorFromString(str: string): Color | undefined {
	// color name from utility constants
	if (constColors.has(str)) { return constColors.get(str); }
	// #rrggbb or #rrggbbaa
	if (str.startsWith("#")) {
		const matches = str.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/);
		if (matches) {
			return {
				red: parseInt(matches[1], 16) / 255,
				green: parseInt(matches[2], 16) / 255,
				blue: parseInt(matches[3], 16) / 255,
				alpha: matches[4] ? parseInt(matches[4], 16) / 255 : 1,
			};
		}
	}
	// r,g,b as int 1-255 or float 0-1
	const matches = str.match(/\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*,?\s*(\d+(?:\.\d+)?))?\s*/);
	if (matches) {
		let r = parseFloat(matches[1]);
		let g = parseFloat(matches[2]);
		let b = parseFloat(matches[3]);
		let a = matches[4] ? parseFloat(matches[4]) : undefined;
		if (r>1 || g>1 || b>1 || a && a>1) {
			r = r/255;
			g = g/255;
			b = b/255;
			if (a) {
				a = a/255;
			}
		}
		if (!a) {
			a = 1;
		}
		return { red: r, green: g, blue: b, alpha: a };
	}

	return undefined;
}
function padHex(i: number): string {
	let hex = Math.floor(i).toString(16);
	if (hex.length < 2) {
		hex = "0" + hex;
	}
	return hex;
}

function roundTo(f:number, places:number):number {
	return Math.round(f*Math.pow(10, places))/Math.pow(10, places);
}
function colorToStrings(color: Color): string[] {
	const names:string[] = [];
	for (const [constname, constcolor] of constColors) {
		if (Math.abs(constcolor.red-color.red) < 0.004 &&
			Math.abs(constcolor.green-color.green) < 0.004 &&
			Math.abs(constcolor.blue-color.blue) < 0.004 &&
			Math.abs(constcolor.alpha-color.alpha) < 0.004) {
			names.push(constname);
			break;
		}
	}

	if (color.alpha > 0.996) {
		names.push(`#${padHex(color.red * 255)}${padHex(color.green * 255)}${padHex(color.blue * 255)}`);
		names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}`);
		names.push(`${roundTo(color.red, 3)}, ${roundTo(color.green, 3)}, ${roundTo(color.blue, 3)}`);
	} else {
		names.push(`#${padHex(color.red * 255)}${padHex(color.green * 255)}${padHex(color.blue * 255)}${padHex(color.alpha * 255)}`);
		names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}, ${Math.floor(color.alpha * 255)}`);
		names.push(`${roundTo(color.red, 3)}, ${roundTo(color.green, 3)}, ${roundTo(color.blue, 3)}, ${roundTo(color.alpha, 3)}`);
	}

	return names;
}
export function provideDocumentColors(document: TextDocument): ColorInformation[] {
	const colors: ColorInformation[] = [];

	for (let i = 0; i < document.lineCount; i++) {
		const range = {start: { line: i, character: 0 }, end: { line: i, character: Infinity} };
		const text = document.getText(range).replace(/(\r\n)|\r|\n$/, "");
		range.end.character = text.length;

		const re = /\[color=([^\]]+)\]/g;
		let matches = re.exec(text);
		while (matches) {
			//if (matches[1])
			{
				let color = colorFromString(matches[1]);
				if (color) {
					colors.push({
						color: color,
						range: {
							start: { line: i, character: matches.index + 7 },
							end: { line: i, character: matches.index + 7 + matches[1].length },
						},
					});
				}
			}
			matches = re.exec(text);
		}
	}
	return colors;
}
export function provideColorPresentations(color: Color, range: Range): ColorPresentation[] {
	return colorToStrings(color).map(colorstring=>{
		return {
			label: colorstring,
			textEdit: {
				range: range,
				newText: colorstring,
			},
		};
	});
}