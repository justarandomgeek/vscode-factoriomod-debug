
import assert from "assert";
import type { Literal, Section, Root, Record, Text, TextNode, Macro, Escape, Comment, Error, PluralMatch, PluralOption, CommentGroup } from "./LocaleAST";
import type { TextDocument } from 'vscode-languageserver-textdocument';

// unist uses 1-based positions, but this is all for LSP, so it's all 0-based
// still unist-compatible Nodes though to allow use of general matching utilities

function span(line:number, startcol:number, length:number) {
	return {
		start: { line: line, character: startcol },
		end: { line: line, character: startcol+length },
	};
}

function literalNode<T extends Literal&{value:string}>(
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

function textNode(value:string, line:number, startcol:number):Text {
	return literalNode("text", value, line, startcol);
}

function matchAt(s:string, r:RegExp, at:number) {
	assert(r.sticky);
	r.lastIndex = at;
	//exec with a /sticky/y regexp is a search exactly at lastIndex
	return r.exec(s);
}

interface searchPattern<T>{
	pattern: RegExp
	parse(matches:RegExpExecArray, line:number, startcol:number):T|undefined
};

function parsePatterns<T extends TextNode>(text:Text, prefix:string):Text[];
function parsePatterns<T extends TextNode>(text:Text, prefix:string, patterns:searchPattern<T>[]):(T|Text)[];
function parsePatterns<T extends TextNode>(text:Text, prefix:string, patterns?:searchPattern<T>[]):(T|Text)[] {
	const value = text.value;
	const line = text.range.start.line;
	const startcol = text.range.start.character;

	const result:(T|Text)[] = [];

	let lastIndex = 0;
	let index = -1;
	do {
		index = value.indexOf(prefix, index+1);
		if (index>=0) {
			if (patterns) {
				patterns.find((pattern)=>{
					const matches = matchAt(value, pattern.pattern, index);
					if (!matches) { return false; }
					const node = pattern.parse(matches, line, startcol);
					if (!node) { return false; }
					if (lastIndex < index-1) {
						result.push(textNode(value.substring(lastIndex, index), line, startcol+lastIndex));
					}
					result.push(node);
					lastIndex = matches.indices![0][1];
					index = lastIndex;
					return true;
				});
			} else {
				result.push(textNode(value.substring(lastIndex, index), line, startcol+lastIndex));
				index += prefix.length;
				lastIndex = index;
			}
		}
	} while (index>=0);
	if (lastIndex <= value.length-1) {
		result.push(textNode(value.substring(lastIndex), line, startcol+lastIndex));
	}
	return result;
}

const escapes:searchPattern<Escape>[] = [
	{
		pattern: /\\n/dy,
		parse(matches, line, startcol) {
			return literalNode<Escape>("escape", "\n", line, startcol+matches.index);
		},
	},
];

function parsePlural(text:Text):PluralOption[] {
	return parsePatterns(text, "|").map((option)=>{
		const split = option.value.indexOf("=");
		const patterns = textNode(option.value.substring(0, split), option.range.start.line, option.range!.start.character);
		const text = textNode(option.value.substring(split+1), option.range.start.line, option.range.start.character+split+1);

		return {
			type: "plural_option",
			range: option.range,
			selectionRange: option.selectionRange,
			children: [
				...parsePatterns(patterns, ",").map(pattern=>{
					if (pattern.value === "rest") {
						return {
							type: "plural_match",
							value: "rest",
							range: pattern.range,
							selectionRange: pattern.selectionRange,
						} as PluralMatch;
					}

					const matches = pattern.value.match(/^(ends in )?(\d+)(?:-(\d+))?$/d);
					if (matches) {
						return {
							type: "plural_match",
							value: matches[3] ? [parseInt(matches[2]), parseInt(matches[3])] : parseInt(matches[2]),
							ends_in: matches[1] ? true : undefined,
							range: pattern.range,
							selectionRange: pattern.selectionRange,
						} as PluralMatch;
					}
					return {
						type: "error",
						value: pattern.value,
						range: pattern.range,
						selectionRange: pattern.selectionRange,
					} as Error;

				}),
				...parsePatterns(text, "__", macros),
			],
		};
	});
}

const macros:searchPattern<TextNode>[] = [
	{
		pattern: /__([0-9]+)__/dy,
		parse(matches, line, startcol) {
			return {
				type: "parameter",
				value: parseInt(matches[1]),
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__plural_for_parameter_([0-9]+)_\{(.*?)\}__/dy,
		parse(matches, line, startcol) {
			return {
				type: "plural",
				value: parseInt(matches[1]),
				children: parsePlural(textNode(matches[2], line, startcol+matches.indices![2][0])),
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__(CONTROL_(?:MOVE|(?:LEFT|RIGHT)_CLICK|KEY_(?:SHIFT|CTRL)|STYLE_(?:BEGIN|END)))__/dy,
		parse(matches, line, startcol) {
			return {
				type: "macro",
				name: matches[1] as Macro["name"],
				children: [],
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__(REMARK_COLOR_(?:BEGIN|END))__/dy,
		parse(matches, line, startcol) {
			return {
				type: "macro",
				name: matches[1] as Macro["name"],
				children: [],
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__(CONTROL(?:_MODIFIER)?|ENTITY|ITEM|TILE|FLUID)__(.+?)__/dy,
		parse(matches, line, startcol) {
			return {
				type: "macro",
				name: matches[1] as Macro["name"],
				children: [literalNode("macro_argument", matches[2], line, startcol+matches.indices![2][0])],
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__(ALT_CONTROL)__(.+?)__(.+?)__/dy,
		parse(matches, line, startcol) {
			return {
				type: "macro",
				name: matches[1] as Macro["name"],
				children: [
					literalNode("macro_argument", matches[2], line, startcol+matches.indices![2][0]),
					literalNode("macro_argument", matches[3], line, startcol+matches.indices![3][0]),
				],
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
	{
		pattern: /__(ALT_CONTROL_(?:LEFT|RIGHT)_CLICK)__(.+?)__/dy,
		parse(matches, line, startcol) {
			return {
				type: "macro",
				name: matches[1] as Macro["name"],
				children: [literalNode("macro_argument", matches[2], line, startcol+matches.indices![1][0])],
				range: span(line, startcol+matches.index!, matches[0].length),
				selectionRange: span(line, startcol+matches.indices![1][0], matches[1].length),
			};
		},
	},
];

function commentGroup(state:ParseState):CommentGroup {
	const comments = state.open_comments;
	state.open_comments = [];
	const first = comments[0];
	const last = comments[comments.length-1];

	return {
		type: "comment_group",
		range: {
			start: first.range.start,
			end: last.range.end,
		},
		selectionRange: first.selectionRange,
		children: comments,
	};
}

interface ParseState {
	root:Root
	open_comments:Comment[]
	open_section?:Section
}
const linePatterns:{
	pattern: RegExp
	parse(matches:RegExpExecArray, line:number, state:ParseState):void
}[] = [
	{
		pattern: /^[\r\t ]*([#;].*)?$/d,
		parse(matches, line, state) {
			if (matches[1]) {
				state.open_comments.push(literalNode("comment", matches[1], line, matches.indices![1][0]));
			} else if (state.open_comments.length > 0) {
				// blank line: push any open comments to the containing scope,
				// instead of holding them for the next token
				(state.open_section??state.root).children.push(commentGroup(state));
			}
		},
	},
	{
		pattern: /^[\r\t ]*\[(.*?)\][\r\t ]*$/d,
		parse(matches, line, state) {
			state.open_section = literalNode<Section>("section", matches[1], line, matches.indices![1][0], {children: []});
			if (state.open_comments.length > 0) {
				state.open_section.children.push(commentGroup(state));
			}
			// include the brackets
			state.open_section.range.start.character-=1;
			state.open_section.range.end.character+=1;

			state.root.children.push(state.open_section);
		},
	},
	{
		pattern: /^[\r\t ]*(.*?)=(.*)$/d,
		parse(matches, line, state) {
			const newrec:Record = literalNode(
				"record", matches[1], line, matches.indices![1][0], {
					children: [
						...parsePatterns(textNode(matches[2], line, matches.indices![2][0]), "__", macros),
					],
				});
			if (state.open_comments.length > 0) {
				newrec.children.unshift(commentGroup(state));
			}
			newrec.range.end.character = matches[0].length;
			(state.open_section??state.root).children.push(newrec);
		},
	},
	{
		pattern: /^.*$/d,
		parse(matches, line, state) {
			state.root.children.push({
				type: "error",
				value: matches[0],
				range: span(line, 0, matches[0].length),
				selectionRange: span(line, 0, 0),
			});
		},
	},
];

export function ParseLocale(doc:TextDocument):Root {
	const parseState:ParseState = {
		root: {
			type: "root",
			children: [],
			range: {
				start: { line: 0, character: 0 },
				end: { line: doc.lineCount, character: 0 },
			},
			selectionRange: span(0, 0, 0),
		},
		open_comments: [],
	};

	for (let line = 0; line < doc.lineCount; line++) {
		const range = {start: { line: line, character: 0 }, end: { line: line, character: Infinity} };
		const text = doc.getText(range).replace(/((\r\n)|\r|\n)$/, "");
		for (const linePattern of linePatterns) {
			const matches = linePattern.pattern.exec(text);
			if (matches) {
				linePattern.parse(matches, line, parseState);
				break;
			}
		}
	}

	return parseState.root;
}