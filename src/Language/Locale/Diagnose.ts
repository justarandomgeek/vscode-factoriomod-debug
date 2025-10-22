import { DiagnosticSeverity } from 'vscode-languageserver';

import type { DiagnoseContext, DiagnoseResult, DiagnoseRule, DiagnoseVisitor, parentOf } from "../ASTUtil.ts";
import type { allNodes, Record, Root, Section } from "./AST.ts";

import { visit } from "unist-util-visit";
import type { DocumentUri } from 'vscode-languageserver-textdocument';

const rules:DiagnoseRule<allNodes>[] = [
	{
		message: "Duplicate Section",
		code: "section.merge",
		setup(context) {
			const seenSections = new Map<string, Section>();
			return {
				section: (node, index, parent)=>{
					const seen = seenSections.get(node.value);
					if (seen) {
						const insertAt = seen.children.length > 0 ?
							seen.children[seen.children.length-1].range.end :
							seen.range.end;

						const moveEnd = node.children.length > 0 ?
							node.children[node.children.length-1].range.end :
							node.range.end;

						context.report({
							diag: {
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
							},
							fix: [
								{
									range: {
										start: node.range.start,
										end: moveEnd,
									},
									newText: "",

								},
								{
									range: {start: insertAt, end: insertAt},
									getText: {
										start: { line: node.range.end.line, character: node.range.end.character+1 },
										end: moveEnd,
									},
								},
							],
						});
					} else {
						seenSections.set(node.value, node);
					}
				},
			};
		},
	},
	{
		message: "Section Name conflicts with Key in Root",
		code: "section.rootconflict",
		setup(context) {
			let root:Root;
			return {
				root: (node, index, parent)=>{
					root = node;
				},
				section: (node, index, parent)=>{
					const rootkey = root.children.find(r=>r.type==="record" && r.value === node.value);
					if (rootkey) {
						context.report({
							diag: {
								range: node.selectionRange,
								relatedInformation: [{
									location: {
										uri: context.uri,
										range: rootkey.range,
									},
									message: "First defined here",
								}],
							},
						});
					}
				},
			};
		},
	},
	{
		message: "Duplicate Key",
		code: "key.duplicate",
		setup(context) {
			const currentSectionKeys = new Map<string, Record>();
			return {
				section: (node, index, parent)=>{
					currentSectionKeys.clear();
				},
				record: (node, index, parent)=>{
					const seen = currentSectionKeys.get(node.value);
					if (seen) {
						context.report({
							diag: {
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
							},
						});
					} else {
						currentSectionKeys.set(node.value, node);
					}
				},
			};
		},
	},
	{
		message: "Key ends with whitespace",
		code: "key.whitespace-end",
		setup(context) {
			return {
				record: (node, index, parent)=>{
					const keyspace = node.value.match(/[\t ]+$/d);
					if (keyspace) {
						context.report({diag: {
							severity: DiagnosticSeverity.Warning,
							range: node.selectionRange,
						}});
					}
				},
			};
		},
	},
	{
		message: "Empty Key",
		code: "key.empty",
		setup(context) {
			return {
				record: (node, index, parent)=>{
					if (!node.value) {
						context.report({diag: {
							range: node.range,
						}});
					}
				},
			};
		},
	},
	{
		message: "Invalid Line",
		code: "error.unknown",
		setup(context) {
			return {
				error: (node, index, parent)=>{
					context.report({diag: {
						range: node.range,
					}});
				},
			};
		},
	},


];

export function diagnose(root:Root, uri:DocumentUri) {
	const reports:(DiagnoseResult&{ message: string; code:string })[] = [];
	const ruleVisitors:{ [N in allNodes as N["type"]]: DiagnoseVisitor<N, allNodes>[] } = {
		"root": [],
		"comment_group": [],
		"comment": [],
		"section": [],
		"record": [],
		"macro": [],
		"macro_argument": [],
		"parameter": [],
		"plural": [],
		"plural_match": [],
		"plural_option": [],
		"richtext": [],
		"richtextopen": [],
		"richtextclose": [],
		"richtextformat": [],
		"text": [],
		"escape": [],
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