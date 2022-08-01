import {
	Diagnostic,
	DiagnosticSeverity,
	DocumentSymbol,
	SymbolKind,
	CodeActionContext,
	CodeAction,
	CodeActionKind,
	Range,
} from 'vscode-languageserver/node';

import type {
	TextDocument,
} from 'vscode-languageserver-textdocument';

export class ChangeLogLanguageService {
	public async validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
		const changelog = textDocument.getText().split(/\r?\n/);
		const diags: Diagnostic[] = [];
		let seenStart = false;
		let seenStartLast = false;
		let seenDate = false;
		let seenCategory = false;
		for (let i = 0; i < changelog.length; i++) {
			let line = changelog[i];
			if (line.match(/^-+$/)) {
				if (line.length !== 99) {
					diags.push({
						message: "Separator line is incorrect length",
						code: "separator.fixlength",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
					});
				}
				line = changelog[++i];
				if (!line) {
					diags.push({
						message: "Unexpected separator line at end of file",
						code: "separator.remove",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i-1, character: 0 }, end: { line: i-1, character: changelog[i-1].length }},
					});
				} else if (!line.startsWith("Version: ")) {
					diags.push({
						message: "Expected version on first line of block",
						code: "version.insert",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
					});
				} else if (!line.match(/^Version: \d+.\d+(.\d+)?/)) {
					diags.push({
						message: "Expected at least two numbers in version string",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: 9 }, end: { line: i, character: line.length }},
					});
				}
				seenStart = true;
				seenStartLast = true;
				seenDate = false;
				seenCategory = false;
			} else if (seenStart) {
				if (line.startsWith("Version: ")) {
					diags.push({
						message: "Duplicate version line - missing separator?",
						code: "separator.insert",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
					});
					seenStartLast = true;
					seenDate = false;
					seenCategory = false;
				} else if (line.startsWith("Date: ")) {
					if (seenDate) {
						diags.push({
							message: "Duplicate date line",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Error,
							range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
						});
					} else if (!seenStartLast) {
						diags.push({
							message: "Date line not immediately after version line",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Warning,
							range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
						});
						seenDate = true;
					} else {
						seenDate = true;
					}
					seenStartLast = false;
				} else if (line.match(/^  [^ ]/)) {
					seenStartLast = false;
					seenCategory = true;
					if (!line.endsWith(":")) {
						diags.push({
							message: "Category line must end with :",
							code: "category.fixend",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Error,
							range: { start: { line: i, character: line.length-1 }, end: { line: i, character: line.length }},
						});
					}
					if (!line.match(/^  (((Major|Minor) )?Features|Graphics|Sounds|Optimi[sz]ations|(Combat )?Balancing|Circuit Network|Changes|Bugfixes|Modding|Scripting|Gui|Control|Translation|Debug|Ease of use|Info|Locale|Other):?$/)) {
						diags.push({
							message: "Non-standard category names will be placed after \"All\"",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Hint,
							range: { start: { line: i, character: 2 }, end: { line: i, character: line.length-1 }},
						});
					}
				} else if (line.match(/^    [- ] /)) {
					seenStartLast = false;
					if (!seenCategory) {
						diags.push({
							message: "Entry not in category",
							code: "category.insert",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Error,
							range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
						});
					}
					if (line.length === 6) {
						diags.push({
							message: "Blank entry line",
							source: "factorio-changelog",
							severity: DiagnosticSeverity.Error,
							range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
						});
					}
				} else if (line.length > 0) {
					diags.push({
						message: "Unrecognized line format",
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
					});
				}
			} else {
				diags.push({
					message: "Line not in valid block",
					source: "factorio-changelog",
					severity: DiagnosticSeverity.Error,
					range: { start: { line: i, character: 0 }, end: { line: i, character: line.length }},
				});
			}
		}
		return diags;
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
					line!.range.end = range.end;
				}
			}
		}
		return symbols;
	}

	public onCodeAction(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
		if (document.languageId === "factorio-changelog") {
			return context.diagnostics.filter(diag=>!!diag.code).map((diag)=>{
				switch (diag.code) {
					case "separator.fixlength":
					{
						const ca:CodeAction = {
							title: "Fix separator Length",
							kind: CodeActionKind.QuickFix + ".separator.fixlength",
							diagnostics: [diag],
							edit: {
								changes: {
									[document.uri]: [
										{
											range: diag.range,
											newText: "--------------------------------------------------------------------------------------------------",
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
											newText: "--------------------------------------------------------------------------------------------------\n",
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
					case "category.fixend":
					{
						const ca:CodeAction = {
							title: "Insert :",
							kind: CodeActionKind.QuickFix + ".category.fixend",
							diagnostics: [diag],
							edit: {
								changes: {
									[document.uri]: [
										{
											range: { start: diag.range.end, end: diag.range.end },
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
					default:
						return undefined;
				}
			}).filter((ca):ca is CodeAction=>!!ca);
		}
		return [];
	}
}