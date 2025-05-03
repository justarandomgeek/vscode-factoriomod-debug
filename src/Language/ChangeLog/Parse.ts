import { literalNode, span } from "../ASTUtil";
import type { DateLine, Category, Entry, Root, Section, VersionLine, EntryExt, SeparatorLine, Error } from "./AST";
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { visitParents } from "unist-util-visit-parents";

interface ParseState {
	root:Root
	open_section?:Section
	open_category?:Category
	open_entries:Entry[]
}

function startSection(line:number, state:ParseState) {
	const sec:Section = {
		type: "section",
		range: span(line, 0, 0),
		selectionRange: span(line, 0, 0),
		children: [],
	};
	state.root.children.push(sec);
	state.open_section = sec;
	state.open_category = undefined;
	state.open_entries = [];
	return sec;
}

const linePatterns:{
	pattern: RegExp
	parse(matches:RegExpExecArray, line:number, state:ParseState):boolean
}[] = [
	{
		pattern: /^$/,
		parse(matches, line, state) {
			// empty line
			return true;
		},
	},
	{
		pattern: /^-+$/,
		parse(matches, line, state) {
			const sec = startSection(line, state);
			const sep = literalNode<SeparatorLine>("separator", matches[0], line, 0);
			sec.children.push(sep);
			return true;
		},
	},
	{
		//pattern: /^Version: (.+)$/d,
		pattern: /^\s*Version\s*:\s*(.+)\s*$/d,
		parse(matches, line, state) {
			const version = literalNode<VersionLine>("version", matches[1], line, matches.indices![1][0], { full_line: matches[0] });
			version.range.start.character = 0;
			if (!state.open_section || state.open_section.children.find(n=>n.type==="version")) {
				startSection(line, state);
			}
			state.open_section!.children.push(version);
			return true;
		},
	},
	{
		//pattern: /^Date: (.+)$/d,
		pattern: /^\s*Date\s*:\s*(.+)\s*$/d,
		parse(matches, line, state) {
			const date = literalNode<DateLine>("date", matches[1], line, matches.indices![1][0], { full_line: matches[0] });
			date.range.start.character = 0;
			if (!state.open_section) {
				startSection(line, state);
			}
			state.open_section!.children.push(date);
			return true;
		},
	},
	{
		//pattern: /^  ([^ ].+):$/d,
		pattern: /^\s*([\w\s]+)\s*:?\s*$/d,
		parse(matches, line, state) {
			if (state.open_entries.length>0 && matches.indices![1][0]>=4 ) {
				//this is more likely an entry extension line (possibly mis-indented)
				return false;
			}
			if (!state.open_section) {
				startSection(line, state);
			}
			const cat = literalNode<Category>("category", matches[1], line, matches.indices![1][0], { full_line: matches[0], children: [] });
			cat.range.start.character = 0;
			state.open_section!.children.push(cat);
			state.open_category = cat;
			state.open_entries = [];
			return true;
		},
	},
	{
		//pattern: /^    - ([^ ].+)$/d,
		pattern: /^\s*(-)\s*(.*)$/d,
		parse(matches, line, state) {
			if (state.open_section && !state.open_category) {
				// start a virtual category to flag missing
				const cat = literalNode<Category>("category", "", line, 0, { full_line: "", children: [], missing: true });
				state.open_section.children.push(cat);
				state.open_category = cat;
				state.open_entries = [];
			}
			if (state.open_category) {
				const rec = literalNode<Entry>("entry", matches[2], line, matches.indices![2][0], {
					full_line: matches[0],
					rank: matches.indices![1][0],
					children: [],
				});
				rec.range.start.character = 0;
				rec.selectionRange.end = rec.selectionRange.start;

				// drop any deeper or equal than the new one...
				const open = state.open_entries.filter(e=>e.rank<rec.rank);
				state.open_entries = open;

				// and add the new one
				if (open.length === 0) {
					state.open_category.children.push(rec);
				} else {
					open[open.length-1].children.push(rec);
				}
				open.push(rec);
				return true;
			}
			return false;
		},
	},
	{
		//pattern: /^      (.+)$/d,
		pattern: /^\s*(.*)$/d,
		parse(matches, line, state) {
			if (state.open_entries.length > 0) {
				const rec = literalNode<EntryExt>("entryext", matches[1], line, matches.indices![1][0], {
					full_line: matches[0],
					rank: matches.indices![1][0],
				});
				rec.range.start.character = 0;
				rec.selectionRange.end = rec.selectionRange.start;
				state.open_entries[state.open_entries.length-1].children.push(rec);
				return true;
			}
			return false;
		},
	},
	{
		pattern: /^.*$/,
		parse(matches, line, state) {
			// anything else is an error...
			const err = literalNode<Error>("error", matches[0], line, 0);
			(state.open_category ?? state.open_section ?? state.root).children.push(err);
			return true;
		},
	},
];

export function ParseChangeLog(doc:TextDocument):Root {
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
		open_entries: [],
	};

	for (let line = 0; line < doc.lineCount; line++) {
		const range = {start: { line: line, character: 0 }, end: { line: line, character: Infinity} };
		const text = doc.getText(range).replace(/\r*\n?$/, "");
		for (const linePattern of linePatterns) {
			const matches = linePattern.pattern.exec(text);
			if (matches && linePattern.parse(matches, line, parseState)) {
				break;
			}
		}
	}

	//re-`rank` entries based on nesting, for diagnose to use...
	visitParents(parseState.root, ["entry", "entryext"], (node, ancestors)=>{
		if (node.type === "entry" || node.type==="entryext") {
			node.rank = ancestors.length - 3; // root, section, category
		}
	});

	//TODO: fixup range ends of nodes with children



	return parseState.root;
}
