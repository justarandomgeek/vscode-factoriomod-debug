'use strict';
import * as vscode from 'vscode';
export async function validateChangelogTxt(document: vscode.Uri|vscode.TextDocument): Promise<vscode.Diagnostic[]> {
	const changelog = (document instanceof vscode.Uri ?
		(await vscode.workspace.fs.readFile(document)).toString() : document.getText()).split(/\r?\n/);
	let diags: vscode.Diagnostic[] = [];
	let seenStart = false;
	let seenStartLast = false;
	let seenDate = false;
	let seenCategory = false;
	for (let i = 0; i < changelog.length; i++) {
		let line = changelog[i];
		if (line.match(/^-+$/)) {
			if (line.length != 99)
				diags.push({
					"message": "Separator line is incorrect length",
					"code": "separator.fixlength",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
			line = changelog[++i];
			if (!line) {
				diags.push({
					"message": "Unexpected separator line at end of file",
					"code": "separator.remove",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i - 1, 0, i - 1, changelog[i - 1].length)
				});
			}
			else if (!line.startsWith("Version: ")) {
				diags.push({
					"message": "Expected version on first line of block",
					"code": "version.insert",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
			}
			else if (!line.match(/^Version: \d+.\d+(.\d+)?/)) {
				diags.push({
					"message": "Expected at least two numbers in version string",
					"code": "version.numbers",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 9, i, line.length)
				});
			}
			seenStart = true;
			seenStartLast = true;
			seenDate = false;
			seenCategory = false;
		}
		else if (seenStart) {
			if (line.startsWith("Version: ")) {
				diags.push({
					"message": "Duplicate version line - missing separator?",
					"code": "separator.insert",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
				seenStartLast = true;
				seenDate = false;
				seenCategory = false;
			}
			else if (line.startsWith("Date: ")) {
				if (seenDate) {
					diags.push({
						"message": "Duplicate date line",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, 0, i, line.length)
					});
				}
				else if (!seenStartLast) {
					diags.push({
						"message": "Date line not immediately after version line",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Warning,
						"range": new vscode.Range(i, 0, i, line.length)
					});
					seenDate = true;
				}
				else {
					seenDate = true;
				}
				seenStartLast = false;
			}
			else if (line.match(/^  [^ ]/)) {
				seenStartLast = false;
				seenCategory = true;
				if (!line.endsWith(":")) {
					diags.push({
						"message": "Category line must end with :",
						"code": "category.fixend",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, line.length - 1, i, line.length)
					});
				}
				if (!line.match(/^  (((Major|Minor) )?Features|Graphics|Sounds|Optimi[sz]ations|(Combat )?Balancing|Circuit Network|Changes|Bugfixes|Modding|Scripting|Gui|Control|Translation|Debug|Ease of use|Info|Locale|Other):?$/)) {
					diags.push({
						"message": "Non-standard category names will be placed after \"All\"",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Hint,
						"range": new vscode.Range(i, 2, i, line.length - 1)
					});
				}
			}
			else if (line.match(/^    [- ] /)) {
				seenStartLast = false;
				if (!seenCategory) {
					diags.push({
						"message": "Entry not in category",
						"code": "category.insert",
						"source": "factorio-changelog",
						"severity": vscode.DiagnosticSeverity.Error,
						"range": new vscode.Range(i, 0, i, line.length)
					});
				}
			}
			else if (line.length > 0) {
				diags.push({
					"message": "Unrecognized line format",
					"source": "factorio-changelog",
					"severity": vscode.DiagnosticSeverity.Error,
					"range": new vscode.Range(i, 0, i, line.length)
				});
			}
		}
		else {
			diags.push({
				"message": "Line not in valid block",
				"source": "factorio-changelog",
				"severity": vscode.DiagnosticSeverity.Error,
				"range": new vscode.Range(i, 0, i, line.length)
			});
		}
	}
	return diags;
}
export class ChangelogCodeActionProvider implements vscode.CodeActionProvider {
	public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.CodeAction[] {
		if (document.languageId == "factorio-changelog") {
			return context.diagnostics.filter(diag => !!diag.code).map((diag) => {
				switch (diag.code) {
					case "separator.fixlength":
						{
							let ca = new vscode.CodeAction("Fix separator Length", vscode.CodeActionKind.QuickFix.append("separator").append("fixlength"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(diag.range, "---------------------------------------------------------------------------------------------------")
							]);
							return ca;
						}
					case "separator.insert":
						{
							let ca = new vscode.CodeAction("Insert separator", vscode.CodeActionKind.QuickFix.append("separator").append("insert"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(new vscode.Range(diag.range.start, diag.range.start), "---------------------------------------------------------------------------------------------------\n")
							]);
							return ca;
						}
					case "separator.remove":
						{
							let ca = new vscode.CodeAction("Remove separator", vscode.CodeActionKind.QuickFix.append("separator").append("remove"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(diag.range, "")
							]);
							return ca;
						}
					case "version.insert":
						{
							let ca = new vscode.CodeAction("Insert version", vscode.CodeActionKind.QuickFix.append("version").append("insert"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(new vscode.Range(diag.range.start, diag.range.start), "Version: 0.0.0 ")
							]);
							return ca;
						}
					case "version.numbers":
						{
							let ca = new vscode.CodeAction("Insert version", vscode.CodeActionKind.QuickFix.append("version").append("numbers"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(new vscode.Range(diag.range.start, diag.range.start), "0.0.0 ")
							]);
							return ca;
						}
					case "category.fixend":
						{
							let ca = new vscode.CodeAction("Insert :", vscode.CodeActionKind.QuickFix.append("category").append("fixend"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(new vscode.Range(diag.range.end, diag.range.end), ":")
							]);
							return ca;
						}
					case "category.insert":
						{
							let ca = new vscode.CodeAction("Insert category", vscode.CodeActionKind.QuickFix.append("category").append("insert"));
							ca.diagnostics = [diag];
							ca.edit = new vscode.WorkspaceEdit();
							ca.edit.set(document.uri, [
								new vscode.TextEdit(new vscode.Range(diag.range.start, diag.range.start), "  Changes:\n")
							]);
							return ca;
						}
					default:
						return new vscode.CodeAction("Dummy", vscode.CodeActionKind.Empty);
				}
			}).filter(diag => !(diag.kind && diag.kind.intersects(vscode.CodeActionKind.Empty)));
		}
		return [];
	}
}
export class ChangelogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentSymbol[] {
		let symbols: vscode.DocumentSymbol[] = [];
		let version: vscode.DocumentSymbol | undefined;
		let category: vscode.DocumentSymbol | undefined;
		let line: vscode.DocumentSymbol | undefined;
		for (let i = 0; i < document.lineCount; i++) {
			const element = document.lineAt(i);
			if (element.text.match(/^Version: .+$/)) {
				version = new vscode.DocumentSymbol(element.text.substr(9, element.text.length), "", vscode.SymbolKind.Namespace, element.range.with(element.range.start.translate(-1, 0)), element.range.with(element.range.start.translate(0, 9)));
				symbols.push(version);
				category = undefined;
				line = undefined;
			}
			else if (element.text.match(/^Date: .+$/)) {
				if (version) {
					version.children.push(new vscode.DocumentSymbol("Date", element.text.substr(6, element.text.length), vscode.SymbolKind.Property, element.range, element.range.with(element.range.start.translate(0, 6))));
					version.range = version.range.union(element.range);
				}
			}
			else if (element.text.match(/^  [^ ]+:$/)) {
				if (version) {
					category = new vscode.DocumentSymbol(element.text.substr(2, element.text.length - 2), "", vscode.SymbolKind.Class, element.range, element.range.with(element.range.start.translate(0, 2), element.range.end.translate(0, -1)));
					version.children.push(category);
					version.range = version.range.union(element.range);
					line = undefined;
				}
			}
			else if (element.text.match(/^    - .+$/)) {
				if (category) {
					line = new vscode.DocumentSymbol(element.text.substr(6, element.text.length), "", vscode.SymbolKind.String, element.range, element.range.with(element.range.start.translate(0, 6)));
					category.children.push(line);
					category.range = category.range.union(element.range);
				}
			}
			else if (element.text.match(/^      .+$/)) {
				if (line) {
					line.children.push(new vscode.DocumentSymbol(element.text.substr(6, element.text.length), "", vscode.SymbolKind.String, element.range, element.range.with(element.range.start.translate(0, 6))));
					line.range = line.range.union(element.range);
				}
			}
		}
		return symbols;
	}
}
