
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

function commentGroup(comments:Comment[]):CommentGroup {
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

export function ParseLocale(doc:TextDocument):Root {
	const root:Root = {
		type: "root",
		children: [],
		range: {
			start: { line: 0, character: 0 },
			end: { line: doc.lineCount, character: 0 },
		},
		selectionRange: {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 0 },
		},
	};
	let open_section:Section|undefined;
	let open_comments:Comment[] = [];

	for (let i = 0; i < doc.lineCount; i++) {
		const range = {start: { line: i, character: 0 }, end: { line: i, character: Infinity} };
		const line = doc.getText(range).replace(/((\r\n)|\r|\n)$/, "");
		range.end.character = line.length;

		// blank lines and comments
		const comment = line.match(/^[\r\t ]*([#;].*)?$/d);
		if (comment) {
			if (comment[1]) {
				open_comments.push(literalNode<Comment>("comment", comment[1], i, comment.indices![1][0]));
			} else if (open_comments.length > 0) {
				// blank line: push any open comments to the containing scope,
				// instead of holding them for the next token
				(open_section??root).children.push(commentGroup(open_comments));
				open_comments = [];
			}
			continue;
		}

		const section = line.match(/^[\r\t ]*\[(.*?)\][\r\t ]*$/d);
		if (section) {
			open_section = literalNode<Section>("section", section[1], i, section.indices![1][0], {children: []});
			if (open_comments.length > 0) {
				open_section.children.push(commentGroup(open_comments));
				open_comments = [];
			}
			// include the brackets
			open_section.range.start.character-=1;
			open_section.range.end.character+=1;

			root.children.push(open_section);
			continue;
		}

		const record = line.match(/^[\r\t ]*(.*?)=(.*)$/d);
		if (record) {
			const newrec:Record = literalNode<Record>(
				"record", record[1], i, record.indices![1][0], {
					children: [
						...parsePatterns(textNode(record[2], i, record.indices![2][0]), "__", macros),
					],
				});
			if (open_comments.length > 0) {
				newrec.children.unshift(commentGroup(open_comments));
				open_comments=[];
			}
			newrec.range.end.character = line.length;
			(open_section??root).children.push(newrec);
			continue;
		}

		root.children.push({
			type: "error",
			value: line,
			range: {
				start: { line: i, character: 0 },
				end: { line: i, character: line.length },
			},
			selectionRange: {
				start: { line: i, character: 0 },
				end: { line: i, character: 0 },
			},
		});
	}

	return root;
}