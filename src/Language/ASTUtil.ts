import type * as unist from "unist";
import type { Range } from "vscode-languageclient";

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