import type { CodeAction, CodeActionContext, Diagnostic, DocumentSymbol, Range, Color, ColorInformation, ColorPresentation, LocationLink, HoverParams, Hover } from 'vscode-languageserver/node';
import { CodeActionKind, DiagnosticSeverity, SymbolKind } from 'vscode-languageserver/node';
import type { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';

import { visitParents } from 'unist-util-visit-parents';
import { ParseLocale } from './Locale/Parse';
import type { Macro, Plural, Record, Root, Section, TextNode } from './Locale/AST';
import { colorFromString, colorToStrings } from './Locale/Color';
import { diagnose } from './Locale/Diagnose';
import { getFixText, rangeOverlaps } from './ASTUtil';

function documentDefinitions(doc:Root, uri:string) {
	const definitions:{ name:string; link:LocationLink; section?:Section; record:Record }[] = [];
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
			section: parent?.type==="section" ? parent : undefined,
			record: record,
		});
	});
	return definitions;
}

function defined<T>(x:T|undefined):x is T { return x !== undefined; }

interface StringParam {
	// the expected type of the param value when filled in
	type: "number"|"string"|"object"

	//detected plural tags for this param?
}

interface StringContext {
	params: StringParam[]
	values?: (string|number)[]
};

export class LocaleLanguageService {

	public hasDiagnosticRelatedInformationCapability:boolean = false;

	readonly definitions:Map<DocumentUri, { name:string; link:LocationLink; section?:Section; record:Record }[]> = new Map();
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

	private recordSymbol(record:Record):DocumentSymbol {
		return {
			name: record.value ? record.value : "<empty>",
			detail: "", //TODO: stringify children? attached comment group?
			kind: record.value ? SymbolKind.String : SymbolKind.Null,
			range: record.range,
			selectionRange: record.selectionRange,
			children: [],
		};
	}

	private sectionSymbols(section:Section):DocumentSymbol {
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
						return this.recordSymbol(node);
					default:
						return undefined;
				}
			}).filter(defined),
		};
	}

	private documentSymbols(doc:Root):DocumentSymbol[] {
		return doc.children.map(node=>{
			switch (node.type) {
				case "section":
					return this.sectionSymbols(node);
				case "record":
					return this.recordSymbol(node);
				default:
					return undefined;
			}
		}).filter(defined);
	}

	public onDocumentSymbol(document: TextDocument): DocumentSymbol[] {
		if (!this.documentTrees.has(document.uri)) {
			this.loadDocument(document);
		}
		const tree = this.documentTrees.get(document.uri);
		if (!tree) { return []; }
		return this.documentSymbols(tree);
	}

	public findDefinitionLinks(name:string) {
		const defs = this.findDefinitions(name);
		return defs.map(def=>def.link);
	}

	private findDefinitions(name: string) {
		const defs = [];
		for (const fromdoc of this.definitions.values()) {
			defs.push(...fromdoc.filter(def=>def.name === name));
		}
		return defs;
	}

	private getKeyPlainText(key:string) {
		const defs = this.findDefinitions(key);
		if (defs.length === 0) {
			return `Unknown key: ${key}`;
		}
		//TODO: filter them down by language? figure out last-loaded among duplicates to resolve the winner?
		return this.getRecordPlainText(defs[0].record);
	}

	private getMacroPlainText(node:Macro) {
		switch (node.name) {
			case 'ENTITY':
				return this.getKeyPlainText(`entity-name.${node.children[0].value}`);
			case 'ITEM':
				return this.getKeyPlainText(`item-name.${node.children[0].value}`);
			case 'TILE':
				return this.getKeyPlainText(`tile-name.${node.children[0].value}`);
			case 'FLUID':
				return this.getKeyPlainText(`fluid-name.${node.children[0].value}`);
			case 'PLANET':
				return this.getKeyPlainText(`space-location-name.${node.children[0].value}`);
			case 'TECHNOLOGY':
				return this.getKeyPlainText(`technology-name.${node.children[0].value}`);
			case 'RECIPE':
				return this.getKeyPlainText(`recipe-name.${node.children[0].value}`);

			//TODO: a lot of these have controller alternate versions
			// proper lookup will also need to read the config.ini for control settings
			case 'CONTROL_KEY_SHIFT':
				return this.getKeyPlainText("control-keys.shift");
			case 'CONTROL_KEY_CTRL':
				return this.getKeyPlainText("control-keys.control");
			case 'CONTROL_MOVE':
				//TODO: this actually does some more complicated logic to list the move controls, or merge to "WASD" if keyboard defaults
				// needs control lookups for proper results
				return `WASD`;

			case 'CONTROL':
			case 'CONTROL_MODIFIER':
				//TODO: needs control lookups
				return `__${node.name}__${node.children[0].value}__`;
			case 'ALT_CONTROL':
				//TODO: needs control lookups
				return `__${node.name}__${node.children[0].value}__${node.children[1].value}__`;

			case 'CONTROL_LEFT_CLICK':
				return this.getKeyPlainText("control-keys.mouse-button-1");
			case 'CONTROL_RIGHT_CLICK':
				return this.getKeyPlainText("control-keys.mouse-button-2");
			case 'ALT_CONTROL_LEFT_CLICK':
				return this.getKeyPlainText(`control-keys.mouse-button-1-alt-${node.children[0].value}`);
			case 'ALT_CONTROL_RIGHT_CLICK':
				return this.getKeyPlainText(`control-keys.mouse-button-2-alt-${node.children[0].value}`);

			case 'CONTROL_STYLE_BEGIN':
				// TODO: font and color from style control_input_shortcut_label, with prototype dump
				return "[font=default-semibold][color=128,206,240]";
			case 'CONTROL_STYLE_END':
				return "[/color][/font]";

			case 'REMARK_COLOR_BEGIN':
				// TODO: color from util const, with prototype dump
				return "[color=34,181,255]";
			case 'REMARK_COLOR_END':
				return "[/color]";

			default:
				throw new Error("Unknown Macro Node Type");
		}
	}

	private getPluralPlainTexts(node:Plural, context:StringContext) {
		return node.children
			.filter(opt=>opt.type==="plural_option")
			.map(opt=>{
				throw new Error("");
			});
	}

	private getNodePlainText(node:TextNode, context:StringContext) {
		switch (node.type) {
			case 'text':
			case 'escape':
				return node.value;

			case 'parameter':
				if (context.values && node.value < context.values.length) {
					const v = context.values[node.value];
					if (v !== undefined) {
						return `${v}`;
					}
				}
				return `__${node.value}__`;

			case 'plural':
				return this.getPluralPlainTexts(node, context);
			case 'macro':
				return this.getMacroPlainText(node);

			default:
				throw new Error("Unknown Text Node Type");
		}
	}

	private getRecordPlainText(record:Record, doc?:TextDocument):string {
		const context:StringContext = {
			params: [],
		};
		return record.children
			.filter(n=>(n.type!=="comment_group" && n.type!=="error"))
			.map(n=>this.getNodePlainText(n, context))
			.join('');
	}

	public onHover(request:HoverParams, document:TextDocument):Hover|null {
		const defs = this.definitions.get(request.textDocument.uri);
		if (defs) {
			const def = defs.find(def=>{
				return def.record.selectionRange.start.line === request.position.line &&
					def.record.selectionRange.start.character <= request.position.character &&
					def.record.selectionRange.end.character >= request.position.character;
			});
			if (def) {
				try {
					return {
						range: def.record.selectionRange,
						contents: {
							kind: 'plaintext',
							value: this.getRecordPlainText(def.record, document),
						},
					};
				} catch (error) {}
			}
		}
		return null;
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