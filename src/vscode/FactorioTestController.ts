import * as vscode from 'vscode';
import { URI, Utils } from 'vscode-uri';
import type { ModPackageProvider } from './ModPackageProvider';
import type { FactorioVersionSelector } from './VersionSelector';
import { runTestSpec, type TestSpec } from '../Test/TestSpec';

export function activate(context: vscode.ExtensionContext, packageProvider: ModPackageProvider, versionSelector:FactorioVersionSelector) {
	const controller = vscode.tests.createTestController("factorio", "Factorio");
	context.subscriptions.push(controller);

	const discoverTests = async ()=>{
		const items:vscode.TestItem[] = [];
		const modspecs = await packageProvider.discoverTestSpecs();
		for (const [modname, specs] of modspecs.entries()) {
			const modItem:vscode.TestItem&{modname?:string} = controller.createTestItem(modname, modname);
			modItem.modname = modname;
			(modItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
			(modItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunChildren"));
			items.push(modItem);

			for (let i = 0; i < specs.length; i++) {
				const spec = specs[i];
				const testItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec} = controller.createTestItem(spec.name, spec.name);
				testItem.sortText= i.toString();
				testItem.modname = modname;
				(testItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
				testItem.suiteConfig = spec;
				modItem.children.add(testItem);

				if ("matched" in spec) {
					if ("scenario" in spec && spec.scenario) {
						if (spec.matched.length === 0) {
							// no valid match... error it and no run?
							(testItem.tags as vscode.TestTag[]).pop();
							testItem.error = `No scenarios match '${spec.scenario}'`;
						} else {
							// matches, add them as children, flag parent as wildcard to run children
							(testItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunChildren"));
							for (const match of spec.matched) {
								let testUri = URI.file(match.path);
								try {
									const controlUri = Utils.joinPath(testUri, "control.lua");
									await vscode.workspace.fs.stat(controlUri);// throws if no file
									testUri = controlUri;
								} catch (error) {}
								const matchItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec; match?:string } = controller.createTestItem(match.name, match.name, testUri);
								matchItem.modname = modname;
								(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
								(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunMatch"));
								matchItem.suiteConfig = spec;
								matchItem.match = match.name;
								testItem.children.add(matchItem);
							}
						}
					} else if ("save" in spec && spec.save) {
						if (spec.matched.length === 0) {
							// no valid match... error it and no run?
							(testItem.tags as vscode.TestTag[]).pop();
							testItem.error = `No saves match '${spec.save}'`;
						} else {
							// matches, add them as children, flag parent as wildcard to run children
							(testItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunChildren"));
							for (const match of spec.matched) {
								const matchItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec; match?:string } = controller.createTestItem(match.name, match.name, vscode.Uri.file(match.path));
								matchItem.modname = modname;
								(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
								(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunMatch"));
								matchItem.suiteConfig = spec;
								matchItem.match = match.path;
								testItem.children.add(matchItem);
							}
						}
					}
				}
			}
		}
		controller.items.replace(items);
	};

	const runHandler = async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken)=>{
		const run = controller.createTestRun(request);
		const newChild = (parent:vscode.TestItem, id:string, label:string)=>{
			const child = controller.createTestItem(id, label);
			parent.children.add(child);
			return child;
		};
		const activeVersion = await versionSelector.getActiveVersion();

		const runItem = async (item:vscode.TestItem)=>{
			if (item.tags.find(t=>t.id === "CanRun")) {
				if (!item.tags.find(t=>t.id === "RunChildren")) {
					const { suiteConfig, match } = item as vscode.TestItem&{modname:string; suiteConfig:TestSpec; match?:string};
					await runTestSpec(activeVersion, vscode.workspace.fs, item, run, newChild, suiteConfig, match);
				} else {
					for (const [_id, child] of item.children) {
						await runItem(child);
					}
				}
			}
		};

		if (request.include) {
			for (const item of request.include) {
				await runItem(item);
			};
		} else {
			// discover and run everything!
			await discoverTests();
			for (const [_modname, moditem] of controller.items) {
				await runItem(moditem);
			}
		}
		run.end();
	};

	controller.refreshHandler = discoverTests;
	context.subscriptions.push(packageProvider.onDidChangeTreeData(()=>{ void discoverTests(); }));
	const fswatch = vscode.workspace.createFileSystemWatcher("**/tests.json");
	context.subscriptions.push(fswatch);
	context.subscriptions.push(fswatch.onDidChange(()=>{ void discoverTests(); }));
	context.subscriptions.push(fswatch.onDidCreate(()=>{ void discoverTests(); }));
	context.subscriptions.push(fswatch.onDidDelete(()=>{ void discoverTests(); }));

	controller.createRunProfile("run", vscode.TestRunProfileKind.Run, runHandler, true, new vscode.TestTag("CanRun"));
	//TODO: Debug profile
}
