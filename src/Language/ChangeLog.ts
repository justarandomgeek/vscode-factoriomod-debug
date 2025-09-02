import type { Diagnostic, DocumentSymbol, CodeActionContext, CodeAction, Range } from 'vscode-languageserver';
import { SymbolKind, CodeActionKind } from 'vscode-languageserver';
import type { DocumentUri, TextDocument, TextEdit } from 'vscode-languageserver-textdocument';
import { parse } from './ChangeLog/Parse.ts';
import type { Category, DateLine, Entry, EntryExt, Root, Section, VersionLine } from './ChangeLog/AST.ts';
import { diagnose } from './ChangeLog/Diagnose.ts';

// for convenience in non-LSP consumers
export { parse, diagnose };

function findVersion(section:Section):VersionLine|undefined {
	for (const node of section.children) {
		if (node.type === "version") {
			return node;
		}
	}
	return undefined;
}

function findDate(section:Section):DateLine|undefined {
	for (const node of section.children) {
		if (node.type === "date") {
			return node;
		}
	}
	return undefined;
}

function findSection(root:Root, forVersion:string):Section|undefined {
	for (const section of root.children) {
		if (section.type === "section") {
			const version = findVersion(section);
			if (version?.value === forVersion) {
				return section;
			}
		}
	}
	return undefined;
}

export function setDate(root:Root, forVersion:string, newdate:string):TextEdit|undefined {
	const section = findSection(root, forVersion);
	if (section) {
		const date = findDate(section);
		if (date) {
			// adjust the value of the existing node...
			return {
				range: date.selectionRange,
				newText: newdate,
			};
		} else {
			// add after version...
			const version = findVersion(section)!;
			return {
				range: {
					start: version.range.end,
					end: version.range.end,
				},
				newText: `\nDate: ${newdate}`,
			};
		}
	}
	return undefined;
}

export class ChangeLogLanguageService {
	readonly documentTrees:Map<DocumentUri, Root> = new Map();

	public loadDocument(document: TextDocument) {
		const tree = parse(document);
		this.documentTrees.set(document.uri, tree);
	}

	public clearDocument(uri:DocumentUri) {
		this.documentTrees.delete(uri);
	}

	public clearFolder(uri:DocumentUri) {
		for (const key of this.documentTrees.keys()) {
			if (key.startsWith(uri)) {
				this.documentTrees.delete(key);
			}
		}
	}

	public diagnose(uri:DocumentUri):Diagnostic[] {
		const tree = this.documentTrees.get(uri);
		if (!tree) { return []; }
		return diagnose(tree, uri);
	}

	private entrySymbol(entry:Entry|EntryExt): DocumentSymbol {
		return {
			name: entry.value || "<empty>",
			detail: "",
			kind: SymbolKind.String,
			range: entry.range,
			selectionRange: entry.selectionRange,
			children: (entry.type === "entry") ? entry.children.map(n=>this.entrySymbol(n)) : [],
		};
	}

	private categorySymbol(category:Category): DocumentSymbol {
		return {
			name: category.value || "<empty>",
			detail: "",
			kind: SymbolKind.Class,
			range: category.range,
			selectionRange: category.selectionRange,
			children: category.children.filter(n=>n.type==="entry").map(n=>this.entrySymbol(n)),
		};
	}

	private dateSymbol(date:DateLine): DocumentSymbol {
		return {
			name: "Date",
			detail: date.value,
			kind: SymbolKind.Property,
			range: date.range,
			selectionRange: date.selectionRange,
		};
	}

	public onDocumentSymbol(document: TextDocument): DocumentSymbol[] {
		const tree = this.documentTrees.get(document.uri);
		if (!tree) { return []; }

		const symbols: DocumentSymbol[] = [];

		for (const section of tree.children) {
			if (section.type === "section") {
				const version = findVersion(section);
				if (!version) { continue; }
				const date = findDate(section);

				const children = section.children.filter(n=>n.type==="category").map(n=>this.categorySymbol(n));

				if (date) {
					children.unshift(this.dateSymbol(date));
				}

				symbols.push({
					name: version.value || "<empty>",
					detail: "",
					kind: SymbolKind.Namespace,
					range: section.range,
					selectionRange: version.selectionRange,
					children: children,
				});
			}
		}

		return symbols;
	}

	public onCodeAction(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
		if (document.languageId !== "factorio-changelog") { return []; }
		return context.diagnostics.flatMap(diag=>{
			if (!diag.code) { return []; }
			switch (diag.code) {
				case "separator.length":
				{
					const ca:CodeAction = {
						title: "Fix separator length",
						kind: CodeActionKind.QuickFix + ".separator.length",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
										newText: "---------------------------------------------------------------------------------------------------",
									},
								],
							},
						},
					};
					return ca;
				}
				case "separator.insert":
				{
					const ca:CodeAction = {
						title: "Insert separator",
						kind: CodeActionKind.QuickFix + ".separator.insert",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: { start: diag.range.start, end: diag.range.start },
										newText: "---------------------------------------------------------------------------------------------------\n",
									},
								],
							},
						},
					};
					return ca;
				}
				case "separator.remove":
				{
					const ca:CodeAction = {
						title: "Remove separator",
						kind: CodeActionKind.QuickFix + ".separator.remove",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: {
											start: diag.range.start,
											end: {
												line: diag.range.start.line+1,
												character: 0,
											},
										},
										newText: "",
									},
								],
							},
						},
					};
					return ca;
				}
				case "version.insert":
				{
					const ca:CodeAction = {
						title: "Insert version",
						kind: CodeActionKind.QuickFix + ".version.insert",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: { start: diag.range.start, end: diag.range.start },
										newText: "Version: 0.0.0\n",
									},
								],
							},
						},
					};
					return ca;
				}
				case "date.remove":
				{
					const ca:CodeAction = {
						title: "Remove date",
						kind: CodeActionKind.QuickFix + ".date.remove",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: {
											start: diag.range.start,
											end: {
												line: diag.range.start.line+1,
												character: 0,
											},
										},
										newText: "",
									},
								],
							},
						},
					};
					return ca;
				}
				case "category.prefix":
				{
					const ca:CodeAction = {
						title: "Fix Prefix",
						kind: CodeActionKind.QuickFix + ".category.prefix",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
										newText: "  ",
									},
								],
							},
						},
					};
					return ca;
				}
				case "category.suffix":
				{
					const ca:CodeAction = {
						title: "Fix Suffix",
						kind: CodeActionKind.QuickFix + ".category.suffix",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
										newText: ":",
									},
								],
							},
						},
					};
					return ca;
				}
				case "category.insert":
				{
					const ca:CodeAction = {
						title: "Insert Category",
						kind: CodeActionKind.QuickFix + ".category.insert",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: { start: diag.range.start, end: diag.range.start },
										newText: "  Changes:\n",
									},
								],
							},
						},
					};
					return ca;
				}
				case "entry.prefix":
				{
					const prefix = '    ' + ('  '.repeat(diag.data?.rank ?? 0)) + '- ';
					const ca:CodeAction = {
						title: "Fix Prefix",
						kind: CodeActionKind.QuickFix + ".entry.prefix",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
										newText: prefix,
									},
								],
							},
						},
					};
					return ca;
				}
				case "entryext.prefix":
				{
					const prefix = '      ';
					const ca:CodeAction = {
						title: "Fix Prefix",
						kind: CodeActionKind.QuickFix + ".entryext.prefix",
						diagnostics: [diag],
						isPreferred: true,
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
										newText: prefix,
									},
								],
							},
						},
					};
					return ca;
				}
				default:
					return [];
			}
		});
	}
}