import { DiagnosticSeverity } from 'vscode-languageserver';

import type { DiagnoseContext, DiagnoseResult, DiagnoseRule, DiagnoseVisitor, parentOf } from "../ASTUtil.ts";
import type { EntryExt, allNodes, Entry, Root, VersionLine, Category } from "./AST.ts";

import { visit } from "unist-util-visit";
import type { DocumentUri } from 'vscode-languageserver-textdocument';

const rules:DiagnoseRule<allNodes>[] = [
	{
		message: "Missing separator",
		code: "separator.insert",
		setup(context) {
			return {
				section: (node, index, parent)=>{
					if (node.children[0].type!=="separator") {
						context.report({
							diag: { range: node.selectionRange },
							fix: [
								{
									range: { start: node.selectionRange.start, end: node.selectionRange.start },
									newText: "---------------------------------------------------------------------------------------------------\n",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Missing version",
		code: "version.insert",
		setup(context) {
			return {
				section: (node, index, parent)=>{
					if (!node.children.find(n=>n.type==="version") &&
						// but skip if this section would already flag "unexpected separator"
						!(node.children.length===1 && node.children[0].type==="separator")) {

						const firstchild = node.children.find(n=>n.type==="date" || n.type==="category");
						if (firstchild) {
							context.report({
								diag: { range: {start: firstchild.range.start, end: firstchild.range.start}},
								fix: [
									{
										range: {start: firstchild.range.start, end: firstchild.range.start},
										newText: "Version: 0.0.0\n",
									},
								],
							});
						}
					}
				},
			};
		},
	},
	{
		message: "Separator line is incorrect length",
		code: "separator.length",
		setup(context) {
			return {
				separator: (node, index, parent)=>{
					if (node.value.length !== 99) {
						context.report({
							diag: { range: node.range },
							fix: [
								{
									range: node.range,
									newText: "---------------------------------------------------------------------------------------------------",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Unexpected separator",
		code: "separator.remove",
		setup(context) {
			return {
				separator: (node, index, parent)=>{
					if (parent.children.length === 1) {
						context.report({
							diag: { range: node.range },
							fix: [
								{
									range: {
										start: node.range.start,
										end: {
											line: node.range.start.line+1,
											character: 0,
										},
									},
									newText: "",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Version must be first line of block",
		code: "version.order",
		setup(context) {
			return {
				version: (node, index, parent)=>{
					if (index>1 || node.range.start.line > parent.range.start.line+1) {
						context.report({
							diag: { range: node.range },
						});
					}
				},
			};
		},
	},
	{
		message: "Version line incorrectly formatted",
		code: "version.format",
		setup(context) {
			return {
				version: (node, index, parent)=>{
					if (node.full_line !== `Version: ${node.value}`) {
						context.report({diag: { range: node.range } });
					}
				},
			};
		},
	},
	{
		message: "Expected two or three decimal numbers in version number",
		code: "version.value",
		setup(context) {
			return {
				version: (node, index, parent)=>{
					if (!node.value.match(/^\d+\.\d+(\.\d+)?/)) {
						context.report({diag: { range: node.selectionRange }});
					}
				},
			};
		},
	},
	{
		message: "Duplicate Version",
		code: "version.duplicate",
		setup(context) {
			const seenVersions = new Map<string, VersionLine>();
			return {
				root: (node, index, parent)=>{
					seenVersions.clear();
				},
				version: (node, index, parent)=>{
					//TODO: a strict/accurate test here would parse these for numeric version comparisions
					// so diffs in leading zeros would still count as same
					// also ignore a trailing comment
					const seen = seenVersions.get(node.value);
					if (seen) {
						context.report({diag: {
							range: node.selectionRange,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.selectionRange,
										uri: context.uri,
									},
								},
							],
						}});
					} else {
						seenVersions.set(node.value, node);
					}
				},
			};
		},
	},
	{
		message: "Date line must be immediately after Version line",
		code: "date.placement",
		setup(context) {
			return {
				date: (node, index, parent)=>{
					const firstDate = parent.children.findIndex(n=>n.type==="date");
					const ver = parent.children.findIndex(n=>n.type==="version");
					if (ver!==-1 && index !== ver+1 && firstDate === index) {
						context.report({diag: { range: node.range }});
					}
				},
			};
		},
	},
	{
		message: "Duplicate Date line in section",
		code: "date.remove",
		setup(context) {
			return {
				date: (node, index, parent)=>{
					const firstDate = parent.children.findIndex(n=>n.type==="date");
					if (firstDate !== index) {
						context.report({
							diag: {
								range: node.range,
								relatedInformation: [
									{
										message: "First defined here",
										location: {
											range: parent.children[firstDate].range,
											uri: context.uri,
										},
									},
								],
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: {
											line: node.range.start.line+1,
											character: 0,
										},
									},
									newText: "",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Date line incorrectly formatted",
		code: "date.format",
		setup(context) {
			return {
				date: (node, index, parent)=>{
					if (node.full_line !== `Date: ${node.value}`) {
						context.report({diag: { range: node.range }});
					}
				},
			};
		},
	},
	{
		message: "Missing Category",
		code: "category.insert",
		setup(context) {
			return {
				category: (node, index, parent)=>{
					if (node.missing) {
						context.report({
							diag: { range: node.range },
							fix: [
								{
									range: { start: node.range.start, end: node.range.start },
									newText: "  Changes:\n",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Category line prefix incorrect",
		code: "category.prefix",
		setup(context) {
			return {
				category: (node, index, parent)=>{
					if (node.missing) { return; }
					if (!node.full_line.startsWith(`  ${node.value}`)) {
						context.report({
							diag: {
								range: {
									start: node.range.start,
									end: {
										line: node.selectionRange.start.line,
										character: node.selectionRange.start.character,
									},
								},
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: {
											line: node.selectionRange.start.line,
											character: node.selectionRange.start.character,
										},
									},
									newText: "  ",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Category line suffix incorrect",
		code: "category.suffix",
		setup(context) {
			return {
				category: (node, index, parent)=>{
					if (node.missing) { return; }
					if (!node.full_line.endsWith(`${node.value}:`)) {
						context.report({
							diag: {
								range: {
									start: {
										line: node.selectionRange.end.line,
										character: node.selectionRange.end.character+1,
									},
									end: node.range.end,
								},
							},
							fix: [
								{
									range: {
										start: {
											line: node.selectionRange.end.line,
											character: node.selectionRange.end.character+1,
										},
										end: node.range.end,
									},
									newText: ":",
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Non-standard category name",
		code: "category.nonstandard",
		setup(context) {
			return {
				category: (node, index, parent)=>{
					if (node.missing) { return; }
					const names = [
						"Major Features", "Features", "Minor Features", "Graphics",
						"Sounds", "Optimizations", "Balancing", "Combat Balancing",
						"Circuit Network", "Changes", "Bugfixes", "Modding", "Scripting",
						"Gui", "Control", "Translation", "Debug", "Ease of use", "Info",
						"Locale", "Compatibility", "Other",
					];
					if (!names.includes(node.value)) {
						context.report({diag: {
							range: node.selectionRange,
							severity: DiagnosticSeverity.Information,
						}});
					}
				},
			};
		},
	},
	{
		message: "Duplicate category",
		code: "category.duplicate",
		setup(context) {
			const seenCategories = new Map<string, Category>();

			return {
				section: (node, index, parent)=>{
					seenCategories.clear();
				},
				category: (node, index, parent)=>{
					if (node.missing) { return; }
					const seen = seenCategories.get(node.value);
					if (seen) {
						context.report({diag: {
							range: node.selectionRange,
							severity: DiagnosticSeverity.Warning,
							relatedInformation: [
								{
									message: "First defined here",
									location: {
										range: seen.selectionRange,
										uri: context.uri,
									},
								},
							],
						}});
					} else {
						seenCategories.set(node.value, node);
					}
				},
			};
		},
	},
	{
		message: "Incorrect entry prefix",
		code: "entry.prefix",
		setup(context) {
			return {
				entry: (node, index, parent)=>{
					// strict match: failing this will fail in-game
					const expect_strict = '    ' + (node.rank === 0 ? '- ' : '  ');
					if (node.rank === 0 && !node.full_line.startsWith(expect_strict)) {
						context.report({
							diag: {
								range: {
									start: node.range.start,
									end: node.selectionRange.start,
								},
								data: { rank: node.rank },
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: node.selectionRange.start,
									},
									newText: expect_strict,
								},
							],
						});
						return;
					}
					// aggressive match: "proper" nesting, but wrong is okay in-game
					const got = node.full_line.slice(0, node.selectionRange.start.character);
					const expect = '    ' + ('  '.repeat(node.rank)) + '- ';
					if (got !== expect) {
						context.report({
							diag: {
								severity:
									!node.full_line.startsWith(expect_strict) ?
										DiagnosticSeverity.Error:
										DiagnosticSeverity.Warning,
								range: {
									start: node.range.start,
									end: node.selectionRange.start,
								},
								data: { rank: node.rank },
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: node.selectionRange.start,
									},
									newText: expect,
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Duplicate entry",
		code: "entry.duplicate",
		setup(context) {
			let activeCategoryLines:Map<string, Entry|EntryExt>|undefined;
			const seenCategoryLines = new Map<string, Map<string, Entry|EntryExt>>();

			const entry:DiagnoseVisitor<Entry|EntryExt, allNodes> = (node, index, parent)=>{
				const catLines = activeCategoryLines;
				if (!catLines) { return; }
				const seen = catLines.get(node.full_line);
				if (seen) {
					context.report({diag: {
						range: node.selectionRange,
						relatedInformation: [
							{
								message: "First defined here",
								location: {
									range: seen.selectionRange,
									uri: context.uri,
								},
							},
						],
					}});
				} else {
					catLines.set(node.full_line, node);
				}
			};
			return {
				section: (node, index, parent)=>{
					seenCategoryLines.clear();
				},
				category: (node, index, parent)=>{
					if (node.missing) { return; }
					const seen = seenCategoryLines.get(node.value);
					if (seen) {
						activeCategoryLines = seen;
					} else {
						activeCategoryLines = new Map();
						seenCategoryLines.set(node.value, activeCategoryLines);
					}
				},
				entry: entry,
				entryext: entry,
			};
		},
	},
	{
		message: "Empty entry line",
		code: "entry.empty",
		setup(context) {
			return {
				entry: (node, index, parent)=>{
					if (node.value.length===0) {
						context.report({diag: { range: node.range }});
					}
				},
			};
		},
	},
	{
		//TODO: stricter option that's still lax enough to pass base?
		message: "Incorrect entry continuation prefix",
		code: "entryext.prefix",
		setup(context) {
			return {
				entryext: (node, index, parent)=>{
					if (!node.full_line.startsWith('      ')) {
						context.report({
							diag: {
								range: {
									start: node.range.start,
									end: {
										line: node.selectionRange.start.line,
										character: node.selectionRange.start.character,
									},
								},
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: {
											line: node.selectionRange.start.line,
											character: node.selectionRange.start.character,
										},
									},
									newText: '      ',
								},
							],
						});
					}
				},
			};
		},
	},
	{
		message: "Invalid line",
		code: "error.unknown",
		setup(context) {
			return {
				error: (node, index, parent)=>{
					context.report({diag: { range: node.range }});
				},
			};
		},
	},
];

export function diagnose(root:Root, uri:DocumentUri) {
	const reports:(DiagnoseResult&{ message: string; code:string })[] = [];
	const ruleVisitors:{ [N in allNodes as N["type"]]: DiagnoseVisitor<N, allNodes>[] } = {
		"root": [],
		"section": [],
		"separator": [],
		"version": [],
		"date": [],
		"category": [],
		"entry": [],
		"entryext": [],
		"error": [],
	};

	for (const rule of rules) {
		const context:DiagnoseContext = {
			uri,
			report(e) {
				reports.push({
					message: rule.message,
					code: rule.code,
					...e,
				});
			},
		};
		const ruleinst = rule.setup(context);
		for (const key in ruleVisitors) {
			const k = key as keyof typeof ruleVisitors;
			if (k in ruleinst && ruleinst[k]) {
				//these types could be nicer...
				const group = ruleVisitors[k] as DiagnoseVisitor<allNodes, allNodes>[];
				group.push(ruleinst[k] as DiagnoseVisitor<allNodes, allNodes>);
			}
		}

	}

	visit(root, (node, index, parent)=>{
		const typeVisitors = ruleVisitors[node.type];
		for (const visitor of typeVisitors) {
			(visitor as DiagnoseVisitor<typeof node, allNodes>)(node, index??-1, parent as parentOf<typeof node, allNodes>);
		}
	});
	return reports;
}