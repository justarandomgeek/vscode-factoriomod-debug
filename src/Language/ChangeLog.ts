import type { Diagnostic, DocumentSymbol, CodeActionContext, CodeAction, Range } from 'vscode-languageserver/node';
import { SymbolKind, CodeActionKind } from 'vscode-languageserver/node';
import type { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';
import { ParseChangeLog } from './ChangeLog/Parse';
import type { Root } from './ChangeLog/AST';
import { diagnose } from './ChangeLog/Diagnose';

export class ChangeLogLanguageService {
	readonly documentTrees:Map<DocumentUri, Root> = new Map();

	public loadDocument(document: TextDocument) {
		const tree = ParseChangeLog(document);
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

	public onDocumentSymbol(document: TextDocument): DocumentSymbol[] {
		const symbols: DocumentSymbol[] = [];
		let version: DocumentSymbol | undefined;
		let category: DocumentSymbol | undefined;
		let line: DocumentSymbol | undefined;
		for (let i = 0; i < document.lineCount; i++) {
			const range = {start: { line: i, character: 0 }, end: { line: i, character: Infinity} };
			const text = document.getText(range).replace(/(\r\n)|\r|\n$/, "");
			range.end.character = text.length;
			if (text.match(/^Version: .+$/)) {
				version = {
					name: text.substring(9),
					detail: "",
					kind: SymbolKind.Namespace,
					range: {start: { line: i-1, character: 0 }, end: { line: i, character: text.length} },
					selectionRange: {start: { line: i, character: 9 }, end: { line: i, character: text.length} },
					children: [],
				};
				symbols.push(version);
				category = undefined;
				line = undefined;
			} else if (text.match(/^Date: .+$/)) {
				if (version) {
					version.children!.push({
						name: "Date",
						detail: text.substring(6),
						kind: SymbolKind.Property,
						range: range,
						selectionRange: {start: { line: i, character: 6 }, end: { line: i, character: text.length} },
					});
					version.range.end = range.end;
				}
			} else if (text.match(/^  [^ ]+:$/)) {
				if (version) {
					category = {
						name: text.substring(2, text.length - 1),
						detail: "",
						kind: SymbolKind.Class,
						range: range,
						selectionRange: {start: { line: i, character: 2 }, end: { line: i, character: text.length-1} },
						children: [],
					};
					version.children!.push(category);
					version.range.end = range.end;
					line = undefined;
				}
			} else if (text.match(/^    - .+$/)) {
				if (category) {
					line = {
						name: text.substring(6),
						detail: "",
						kind: SymbolKind.String,
						range: range,
						selectionRange: {start: { line: i, character: 6 }, end: { line: i, character: text.length} },
						children: [],
					};
					category.children!.push(line);
					version!.range.end = range.end;
					category.range.end = range.end;
				}
			} else if (text.match(/^      .+$/)) {
				if (line) {
					line.children!.push({
						name: text.substring(6),
						detail: "",
						kind: SymbolKind.String,
						range: range,
						selectionRange: {start: { line: i, character: 6 }, end: { line: i, character: text.length} },
					});

					version!.range.end = range.end;
					category!.range.end = range.end;
					line.range.end = range.end;
				}
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
						edit: {
							changes: {
								[document.uri]: [
									{
										range: diag.range,
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