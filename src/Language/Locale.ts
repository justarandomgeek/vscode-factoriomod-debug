import type { CodeAction, CodeActionContext, Diagnostic, DocumentSymbol, Range, Color, ColorInformation, ColorPresentation, LocationLink } from 'vscode-languageserver/node';
import { CodeActionKind, DiagnosticSeverity, SymbolKind } from 'vscode-languageserver/node';
import type { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';

import { visitParents } from 'unist-util-visit-parents';
import { ParseLocale } from './Locale/Parse';
import type { Record, Root, Section } from './Locale/AST';
import { colorFromString, colorToStrings } from './Locale/Color';
import { diagnose } from './Locale/Diagnose';
import { getFixText, rangeOverlaps } from './ASTUtil';

function documentDefinitions(doc:Root, uri:string) {
	const definitions:{ name:string; link:LocationLink }[] = [];
	visitParents(doc, "record", (record, parents)=>{
		const parent = parents.length > 0 ? parents[parents.length-1] : undefined;
		const section = parent?.type==="section" ? parent.value : undefined;
		definitions.push({
			name: section ? `${section}.${record.value}` : record.value,
			link: {
				targetUri: uri,
				targetRange: record.range,
				targetSelectionRange: record.selectionRange,
			},
		});
	});
	return definitions;
}

function defined<T>(x:T|undefined):x is T { return x !== undefined; }

function recordSymbol(record:Record):DocumentSymbol {
	return {
		name: record.value ? record.value : "<empty>",
		detail: "", //TODO: stringify children? attached comment group?
		kind: record.value ? SymbolKind.String : SymbolKind.Null,
		range: record.range,
		selectionRange: record.selectionRange,
		children: [],
	};
}

function sectionSymbols(section:Section):DocumentSymbol {
	return {
		name: section.value ? section.value : "[empty]",
		detail: "", //TODO: first comment group?
		tags: [],
		kind: SymbolKind.Namespace,
		range: section.range,
		selectionRange: section.selectionRange,
		children: section.children.map(node=>{
			switch (node.type) {
				case "record":
					return recordSymbol(node);
				default:
					return undefined;
			}
		}).filter(defined),
	};
}

function documentSymbols(doc:Root):DocumentSymbol[] {
	return doc.children.map(node=>{
		switch (node.type) {
			case "section":
				return sectionSymbols(node);
			case "record":
				return recordSymbol(node);
			default:
				return undefined;
		}
	}).filter(defined);
}

export class LocaleLanguageService {

	public hasDiagnosticRelatedInformationCapability:boolean = false;

	readonly definitions:Map<DocumentUri, { name:string; link:LocationLink }[]> = new Map();
	readonly documentTrees:Map<DocumentUri, Root> = new Map();

	public loadDocument(document: TextDocument) {
		const tree = ParseLocale(document);
		this.documentTrees.set(document.uri, tree);
		this.definitions.set(document.uri, documentDefinitions(tree, document.uri));
	}

	public clearDocument(uri:DocumentUri) {
		this.definitions.delete(uri);
		this.documentTrees.delete(uri);
	}

	public clearFolder(uri:DocumentUri) {
		for (const key of this.definitions.keys()) {
			if (key.startsWith(uri)) {
				this.definitions.delete(key);
			}
		}
		for (const key of this.documentTrees.keys()) {
			if (key.startsWith(uri)) {
				this.documentTrees.delete(key);
			}
		}
	}

	public diagnose(uri:DocumentUri):Diagnostic[] {
		const tree = this.documentTrees.get(uri);
		if (!tree) { return []; }
		const reports = diagnose(tree, uri);

		const diags:Diagnostic[] = [];
		for (const report of reports) {
			diags.push({
				message: report.message,
				code: report.code,
				source: "factorio-locale",
				severity: DiagnosticSeverity.Error,
				...report.diag,
			});
		}
		return diags;
	}

	public onDocumentSymbol(document: TextDocument): DocumentSymbol[] {
		if (!this.documentTrees.has(document.uri)) {
			this.loadDocument(document);
		}
		const tree = this.documentTrees.get(document.uri);
		if (!tree) { return []; }
		return documentSymbols(tree);
	}

	public findDefinitions(name:string) {
		const defs = [];
		for (const fromdoc of this.definitions.values()) {
			defs.push(...fromdoc.filter(def=>def.name===name).map(def=>def.link));
		}
		return defs;
	}

	public getCompletions(prefix?:string) {
		const defs = [];
		for (const fromdoc of this.definitions.values()) {
			if (prefix) {
				defs.push(fromdoc.map(def=>def.name).filter(name=>name.startsWith(prefix)));
			} else {
				defs.push(fromdoc.map(def=>def.name).map(name=>{
					const dot = name.indexOf(".");
					if (dot === -1) {
						return name;
					} else {
						return name.substring(0, dot+1);
					}
				}));
			}
		}
		return [...new Set(defs.flat())];
	}

	public onCodeAction(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
		if (document.languageId !== "factorio-locale") { return []; }

		const tree = this.documentTrees.get(document.uri);
		if (!tree) { return []; }
		const reports = diagnose(tree, document.uri).filter(r=>!!r.fix);
		const overlaps = reports.filter(r=>rangeOverlaps(range, r.diag.range));
		const ca:CodeAction[] = [];

		const seenCodes = new Set<string>();

		for (const r of overlaps) {
			ca.push({
				title: `Fix this ${r.code}`,
				kind: CodeActionKind.QuickFix + '.' + r.code,
				diagnostics: [
					{
						message: r.message,
						code: r.code,
						source: "factorio-locale",
						severity: DiagnosticSeverity.Error,
						...r.diag,
					},
				],
				isPreferred: true,
				edit: {
					changes: { [document.uri]: getFixText(document, r.fix!) },
				},
			});

			if (!seenCodes.has(r.code)) {
				seenCodes.add(r.code);
				const samecode = reports.filter(rr=>rr.code === r.code);
				if (samecode.length > 1) {
					ca.push({
						title: `Fix all ${r.code} in file`,
						kind: CodeActionKind.QuickFix + '.' + r.code + ".all",
						diagnostics: samecode.map(rr=>{
							return {
								message: rr.message,
								code: rr.code,
								source: "factorio-locale",
								severity: DiagnosticSeverity.Error,
								...rr.diag,
							};
						}),
						//isPreferred: true,
						edit: {
							changes: { [document.uri]: getFixText(document, samecode.flatMap(rr=>rr.fix!)) },
						},
					});
				}
			}
		}

		if (reports.length > overlaps.length) {
			ca.push({
				title: `Fix all auto-fixable in file`,
				kind: CodeActionKind.QuickFix + ".all",
				diagnostics: reports.map(rr=>{
					return {
						message: rr.message,
						code: rr.code,
						source: "factorio-locale",
						severity: DiagnosticSeverity.Error,
						...rr.diag,
					};
				}),
				//isPreferred: true,
				edit: {
					changes: { [document.uri]: getFixText(document, reports.flatMap(rr=>rr.fix!)) },
				},
			});
		}

		return ca;
	}

	public onDocumentColor(document: TextDocument): ColorInformation[] {
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
					const color = colorFromString(matches[1]);
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
	public onColorPresentation(color: Color, range: Range): ColorPresentation[] {
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
}