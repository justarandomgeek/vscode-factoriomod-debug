import type * as unist from "unist";
import type { Diagnostic, Position, Range, TextEdit } from "vscode-languageclient";
import type { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";

export interface Node extends Omit<unist.Node, "position"> {
	range: Range
	selectionRange: Range
}

export interface Literal extends Omit<unist.Literal, "position">, Node {

}

export interface Parent extends Omit<unist.Parent, "position">, Node {
	children: Node[]
}


// unist uses 1-based positions, but this is all for LSP, so it's all 0-based
// still unist-compatible Nodes though to allow use of general matching utilities

export function span(line:number, startcol:number, length:number) {
	return {
		start: { line: line, character: startcol },
		end: { line: line, character: startcol+length },
	};
}

export function literalNode<T extends Literal&{value:string}>(
	type:T["type"], value:string, line:number, startcol:number,
	extra?:Omit<T, "type"|"value"|"range"|"selectionRange">
): T {
	return {
		type: type,
		value: value,
		range: span(line, startcol, value.length),
		selectionRange: span(line, startcol, value.length),
		...extra,
	} as T;
}

type allParents<allNodesType> = Extract<allNodesType, Parent>;

export type parentOf<N extends Node, allNodesType> = {
	[k in allParents<allNodesType> as k["type"]]: N extends k["children"][0] ? k : never;
}[allParents<allNodesType>["type"]];

export type DiagnoseVisitor<N extends Node, allNodesType> =
	(node: N, index: number, parent: parentOf<N, allNodesType>) => void;

interface TextMove extends Omit<TextEdit, "newText">
{
	getText: Range
}
export interface DiagnoseResult {
	diag: Omit<Diagnostic, "message" | "code" | "source">
	fix?: (TextEdit|TextMove)[]
}

export function getFixText(document:TextDocument, fix:(TextEdit|TextMove)[]): TextEdit[] {
	return fix.map(f=>{
		if ("newText" in f) {
			return f;
		}
		const newText = document.getText(f.getText);
		return {
			range: f.range,
			newText,
		};
	});
}

export interface DiagnoseContext {
	uri: DocumentUri
	report: (e: DiagnoseResult) => void
}

export interface DiagnoseRule<allNodesType extends Node> {
	message: string
	code: string
	setup: (context: DiagnoseContext) => {
		[N in allNodesType as N["type"]]?: DiagnoseVisitor<N, allNodesType>;
	}
}

function comparePosition(a: Position, b: Position) {
	if (a.line < b.line) { return -1; }
	if (a.line > b.line) { return 1; }

	if (a.character < b.character) { return -1; }
	if (a.character > b.character) { return 1; }

	return 0;
}

export function rangeOverlaps(a: Range, b: Range) {
	if (comparePosition(a.end, b.start) < 0) { return false; }
	if (comparePosition(b.end, a.start) < 0) { return false; }
	return true;
}

