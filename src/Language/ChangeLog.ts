import type { Diagnostic, DocumentSymbol, CodeActionContext, CodeAction, Range, Position } from 'vscode-languageserver';
import { DiagnosticSeverity, SymbolKind, CodeActionKind } from 'vscode-languageserver';
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

function comparePosition(a:Position, b:Position) {
	if (a.line < b.line) { return -1; }
	if (a.line > b.line) { return 1; }

	if (a.character < b.character) { return -1; }
	if (a.character > b.character) { return 1; }

	return 0;
}

function rangeOverlaps(a:Range, b:Range) {
	if (comparePosition(a.end, b.start) < 0) { return false; }
	if (comparePosition(b.end, a.start) < 0) { return false; }
	return true;
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
		const reports = diagnose(tree, uri);

		const diags:Diagnostic[] = [];
		for (const report of reports) {
			diags.push({
				message: report.message,
				code: report.code,
				source: "factorio-changelog",
				severity: DiagnosticSeverity.Error,
				...report.diag,
			});
		}
		return diags;
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

		const tree = this.documentTrees.get(document.uri);
		if (!tree) { return []; }
		const reports = diagnose(tree, document.uri).filter(r=>!!r.fix);
		const overlaps = reports.filter(r=>rangeOverlaps(range, r.diag.range));

		return overlaps.map(r=>{
			return {
				title: `Fix this ${r.code}`,
				kind: CodeActionKind.QuickFix + '.' + r.code,
				diagnostics: [
					{
						message: r.message,
						code: r.code,
						source: "factorio-changelog",
						severity: DiagnosticSeverity.Error,
						...r.diag,
					},
				],
				isPreferred: true,
				edit: {
					changes: { [document.uri]: r.fix! },
				},
			};
		});
	}
}