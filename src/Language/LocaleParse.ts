
import assert from "assert";
import type { Processor } from "unified";
import type { Literal } from "unist";
import type { Section, Root, Record, Text, TextNode, Macro, Escape, Comment, Error, PluralMatch } from "./LocaleAST";

function span(line:number, startcol:number, length:number) {
	return {
		start: { line: line, column: startcol },
		end: { line: line, column: startcol+length },
	};
}

function literalNode<T extends Literal<string>>(
	type:T["type"], value:string, line:number, startcol:number,
	extra?:Omit<T, "type"|"value"|"position">
): T {
	return {
		type: type,
		value: value,
		position: span(line, startcol, value.length),
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

function parsePatterns<T extends TextNode>(text:TextNode, prefix:string, patterns?:searchPattern<T>[]):TextNode[] {
	if (text.type !== "text") { return [ text ]; }
	const value = text.value;
	const line = text.position!.start.line;
	const startcol = text.position!.start.column;

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

const macros:searchPattern<TextNode>[] = [
	{
		pattern: /__([0-9]+)__/dy,
		parse(matches, line, startcol) {
			return {
				type: "parameter",
				value: parseInt(matches[1]),
				position: span(line, startcol+matches.index!, matches[0].length),
			};
		},
	},
	{
		pattern: /__plural_for_parameter_([0-9]+)_\{(.*?)\}__/dy,
		parse(matches, line, startcol) {
			return {
				type: "plural",
				value: parseInt(matches[1]),
				children: (parsePatterns(textNode(matches[2], line, startcol+matches.indices![2][0]), "|") as Text[])
					.map((option)=>{
						const split = option.value.indexOf("=");
						const patterns = textNode(option.value.substring(0, split), option.position!.start.line, option.position!.start.column);
						const text = textNode(option.value.substring(split+1), option.position!.start.line, option.position!.start.column+split+1);

						return {
							type: "plural_option",
							position: option.position!,
							children: [
								...(parsePatterns(patterns, ",") as Text[]).map(pattern=>{
									if (pattern.value === "rest") {
										return {
											type: "plural_match",
											value: "rest",
											position: pattern.position,
										} as PluralMatch;
									}

									const matches = pattern.value.match(/^(ends in )?(\d+)(?:-(\d+))?$/d);
									if (matches) {
										return {
											type: "plural_match",
											value: matches[3] ? [parseInt(matches[2]), parseInt(matches[3])] : parseInt(matches[2]),
											ends_in: matches[1] ? true : undefined,
											position: pattern.position,
										} as PluralMatch;
									}
									return {
										type: "error",
										value: pattern.value,
										position: pattern.position,
									} as Error;

								}),
								...parsePatterns(text, "__", macros),
							],
						};
					}),
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
				position: span(line, startcol+matches.index!, matches[0].length),
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
				position: span(line, startcol+matches.index!, matches[0].length),
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
				position: span(line, startcol+matches.index!, matches[0].length),
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
				position: span(line, startcol+matches.index!, matches[0].length),
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
				position: span(line, startcol+matches.index!, matches[0].length),
			};
		},
	},
];

export default function LocaleParse(this:Processor):void {
	this.Parser = (doc)=>{

		const root:Root = {
			type: "root",
			children: [],
		};
		let open_section:Section|undefined;
		const lines = doc.split(/\n/);
		root.position = {
			start: { line: 1, column: 1 },
			end: { line: lines.length, column: lines[lines.length-1].length+1 },
		};
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// blank lines and comments
			const comment = line.match(/^[\r\t ]*([#;].*)?$/d);
			if (comment) {
				if (comment[1]) {
					(open_section??root).children.push(literalNode<Comment>("comment", comment[1], i+1, comment.indices![1][0]+1));
				}
				continue;
			}

			const section = line.match(/^[\r\t ]*\[(.*?)\][\r\t ]*$/d);
			if (section) {
				open_section = literalNode<Section>("section", section[1], i+1, section.indices![1][0]+1, {children: []});
				root.children.push(open_section);
				continue;
			}

			const record = line.match(/^[\r\t ]*(.*?)=(.*)$/d);
			if (record) {
				(open_section??root).children.push(literalNode<Record>(
					"record", record[1], i+1, record.indices![1][0]+1, {
						children: parsePatterns(textNode(record[2], i+1, record.indices![2][0]+1), "__", macros),
					}));
				continue;
			}

			root.children.push({
				type: "error",
				value: line,
				position: {
					start: { line: i+1, column: 1 },
					end: { line: i+1, column: line.length+1 },
				},
			});
		}

		return root;
	};
}