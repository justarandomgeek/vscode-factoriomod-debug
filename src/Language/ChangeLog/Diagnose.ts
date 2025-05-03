import type { Diagnostic } from 'vscode-languageserver/node';
import { DiagnosticSeverity } from 'vscode-languageserver/node';

import type { Parent } from "../ASTUtil";
import type { EntryExt, allNodes, Entry, Root, VersionLine, Category } from "./AST";

import { visit } from "unist-util-visit";
import type { DocumentUri } from 'vscode-languageserver-textdocument';

type allParents = Extends<allNodes, Parent>;

type parentOf<N extends allNodes> = {
	[k in allParents as k["type"]]: N extends k["children"][0] ? k : never
}[allParents["type"]];

interface testRule<N extends allNodes = allNodes> {
	message:string
	code:string
	severity?: DiagnosticSeverity
	test:(node:N, index:number, parent:parentOf<N>)=>
		(Omit<Diagnostic, "message"|"code"|"source"|"severity">&{severity?: DiagnosticSeverity})|undefined
}


export function diagnose(root:Root, uri:DocumentUri) {
	const diags:Diagnostic[] = [];
	const seenVersions = new Map<string, VersionLine>();
	let activeCategory:{ category:Category; seenLines:Map<string, Entry|EntryExt> }|undefined;
	const seenCategories = new Map<string, typeof activeCategory>();
	const rules:{ [N in allNodes as N["type"]]: testRule<N>[] } = {
		"root": [],
		"section": [
			{
				message: "Missing separator",
				code: "separator.insert",
				test(node, index, parent) {
					if (node.children[0].type!=="separator") {
						return { range: node.selectionRange };
					}
					return undefined;
				},
			},
			{
				message: "Missing version",
				code: "version.insert",
				test(node, index, parent) {
					if (!node.children.find(n=>n.type==="version") &&
						// but skip if this section would already flag "unexpected separator"
						!(node.children.length===1 && node.children[0].type==="separator")) {

						const firstchild = node.children.find(n=>n.type==="date" || n.type==="category");
						if (firstchild) {
							return { range: {start: firstchild.range.start, end: firstchild.range.start}};
						}
					}
					return undefined;
				},
			},
		],
		"separator": [
			{
				message: "Separator line is incorrect length",
				code: "separator.length",
				test(node, index, parent) {
					if (node.value.length !== 99) {
						return { range: node.range };
					}
					return undefined;
				},
			},
			{
				message: "Unexpected separator",
				code: "separator.remove",
				test(node, index, parent) {
					if (parent.children.length === 1) {
						return { range: node.range };
					}
					return undefined;
				},
			},
		],
		"version": [
			{
				message: "Version must be first line of block",
				code: "version.order",
				test(node, index, parent) {
					if (index>1 || node.range.start.line > parent.range.start.line+1) {
						return { range: node.range };
					}
					return undefined;
				},
			},
			{
				message: "Version line incorrectly formatted",
				code: "version.format",
				test(node, index, parent) {
					if (node.full_line !== `Version: ${node.value}`) {
						return { range: node.range };
					}
					return undefined;
				},
			},
			{
				message: "Expected two or three decimal numbers in version number",
				code: "version.value",
				test(node, index, parent) {
					if (!node.value.match(/^\d+\.\d+(\.\d+)?/)) {
						return { range: node.selectionRange };
					}
					return undefined;
				},
			},
			{
				message: "Duplicate Version",
				code: "version.duplicate",
				test(node, index, parent) {
					//TODO: a strict/accurate test here would parse these for numeric version comparisions
					// so diffs in leading zeros would still count as same
					// also ignore a trailing comment
					const seen = seenVersions.get(node.value);
					if (seen) {
						return {
							range: node.selectionRange,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.selectionRange,
										uri,
									},
								},
							],
						};
					} else {
						seenVersions.set(node.value, node);
					}
					return undefined;
				},
			},
		],
		"date": [
			{
				message: "Date line must be immediately after Version line",
				code: "date.placement",
				test(node, index, parent) {
					const firstDate = parent.children.findIndex(n=>n.type==="date");
					const ver = parent.children.findIndex(n=>n.type==="version");
					if (ver!==-1 && index !== ver+1 && firstDate === index) {
						return { range: node.range };
					}
					return undefined;
				},
			},
			{
				message: "Duplicate Date line in section",
				code: "date.remove",
				test(node, index, parent) {
					const firstDate = parent.children.findIndex(n=>n.type==="date");
					if (firstDate !== index) {
						return {
							range: node.range,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: parent.children[firstDate].range,
										uri,
									},
								},
							],
						};
					}
					return undefined;
				},
			},
			{
				message: "Date line incorrectly formatted",
				code: "date.format",
				test(node, index, parent) {
					if (node.full_line !== `Date: ${node.value}`) {
						return { range: node.range };
					}
					return undefined;
				},
			},
		],
		"category": [
			{
				message: "Missing Category",
				code: "category.insert",
				test(node, index, parent) {
					if (node.missing) {
						return { range: node.range };
					}
					return undefined;
				},
			},
			{
				message: "Category line prefix incorrect",
				code: "category.prefix",
				test(node, index, parent) {
					if (node.missing) { return undefined; }
					if (!node.full_line.startsWith(`  ${node.value}`)) {
						return { range: {
							start: node.range.start,
							end: {
								line: node.selectionRange.start.line,
								character: node.selectionRange.start.character,
							},
						} };
					}
					return undefined;
				},
			},
			{
				message: "Category line suffix incorrect",
				code: "category.suffix",
				test(node, index, parent) {
					if (node.missing) { return undefined; }
					if (!node.full_line.endsWith(`${node.value}:`)) {
						return { range: {
							start: {
								line: node.selectionRange.end.line,
								character: node.selectionRange.end.character+1,
							},
							end: node.range.end,
						} };
					}
					return undefined;
				},
			},
			{
				message: "Non-standard category name",
				code: "category.nonstandard",
				severity: DiagnosticSeverity.Information,
				test(node, index, parent) {
					if (node.missing) { return undefined; }
					const names = [
						"Major Features", "Features", "Minor Features", "Graphics",
						"Sounds", "Optimizations", "Balancing", "Combat Balancing",
						"Circuit Network", "Changes", "Bugfixes", "Modding", "Scripting",
						"Gui", "Control", "Translation", "Debug", "Ease of use", "Info",
						"Locale", "Compatibility", "Other",
					];
					if (!names.includes(node.value)) {
						return { range: node.selectionRange };
					}
					return undefined;
				},
			},
			{
				message: "Duplicate category",
				code: "category.duplicate",
				severity: DiagnosticSeverity.Warning,
				test(node, index, parent) {
					if (node.missing) { return undefined; }
					const seen = seenCategories.get(node.value);
					if (seen) {
						activeCategory = seen;
						return {
							range: node.selectionRange,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.category.selectionRange,
										uri,
									},
								},
							],
						};
					} else {
						const cat = {
							category: node,
							seenLines: new Map(),
						};
						activeCategory = cat;
						seenCategories.set(node.value, cat);
					}
					return undefined;
				},
			},
		],
		"entry": [
			{

				message: "Incorrect entry prefix",
				code: "entry.prefix",
				severity: DiagnosticSeverity.Warning,
				test(node, index, parent) {

					return undefined;
				},
			},
			{
				message: "Incorrect entry prefix",
				code: "entry.prefix",
				test(node, index, parent) {
					// strict match: failing this will fail in-game
					const expect_strict = '    ' + (node.rank === 0 ? '- ' : '  ');
					if (!node.full_line.startsWith(expect_strict)) {
						return {
							range: {
								start: node.range.start,
								end: node.selectionRange.start,
							},
							data: { rank: node.rank },
						};
					}
					// aggressive match: "proper" nesting, but wrong is okay in-game
					const got = node.full_line.slice(0, node.selectionRange.start.character);
					const expect = '    ' + ('  '.repeat(node.rank)) + '- ';
					if (got !== expect) {
						return {
							severity: DiagnosticSeverity.Warning,
							range: {
								start: node.range.start,
								end: node.selectionRange.start,
							},
							data: { rank: node.rank },
						};
					}
					return undefined;
				},
			},
			{
				message: "Duplicate entry",
				code: "entry.duplicate",
				test(node, index, parent) {
					const cat = activeCategory;
					if (!cat) { return undefined; }
					const seen = cat.seenLines.get(node.full_line);
					if (seen) {
						return {
							range: node.selectionRange,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.selectionRange,
										uri,
									},
								},
							],
						};
					} else {
						cat.seenLines.set(node.full_line, node);
					}
					return undefined;
				},
			},
			{
				message: "Empty entry line",
				code: "entry.empty",
				test(node, index, parent) {
					if (node.value.length===0) {
						return { range: node.range };
					}
					return undefined;
				},
			},
		],
		"entryext": [
			{
				//TODO: stricter option that's still lax enough to pass base?
				message: "Incorrect entry continuation prefix",
				code: "entryext.prefix",
				test(node, index, parent) {
					if (!node.full_line.startsWith('      ')) {
						return {
							range: {
								start: node.range.start,
								end: {
									line: node.selectionRange.start.line,
									character: node.selectionRange.start.character-1,
								},
							},
						};
					}
					return undefined;
				},
			},
			{
				message: "Duplicate entry",
				code: "entry.duplicate",
				test(node, index, parent) {
					const cat = activeCategory;
					if (!cat) { return undefined; }
					const seen = cat.seenLines.get(node.full_line);
					if (seen) {
						return {
							range: node.selectionRange,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.selectionRange,
										uri,
									},
								},
							],
						};
					} else {
						cat.seenLines.set(node.full_line, node);
					}
					return undefined;
				},
			},
		],
		"error": [
			{
				message: "Invalid line",
				code: "error.unknown",
				test(node, index, parent) {
					return { range: node.range };
				},
			},
		],
	};
	visit(root, (node, index, parent)=>{
		switch (node.type) {
			case "section":
				seenCategories.clear();
				break;
			case 'category':
				break;
		}
		const trules = rules[node.type];
		for (const rule of trules) {
			const d = (rule as testRule<typeof node>).test(node, index??-1, parent as parentOf<typeof node>);
			if (d) {
				diags.push({
					message: rule.message,
					code: rule.code,
					source: "factorio-changelog",
					severity: rule.severity ?? DiagnosticSeverity.Error,
					...d,
				});
			}
		}

	});
	return diags;
}