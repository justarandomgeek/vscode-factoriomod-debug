import * as vscode from 'vscode';
import type { ModPackageProvider } from './ModPackageProvider';
import type { FactorioVersionSelector } from './VersionSelector';
import { Parser } from "tap-parser";
import { TestSpecArgs, type ScenarioTestSpec, type TestSpec, type WildcardTestSpec } from '../Test/TestSpec';
import { tapToTestItems } from '../Test/TAP';

export function activate(context: vscode.ExtensionContext, packageProvider: ModPackageProvider, versionSelector:FactorioVersionSelector) {
	const controller = vscode.tests.createTestController("factorio", "Factorio");
	context.subscriptions.push(controller);

	const discoverTests = async ()=>{
		const items:vscode.TestItem[] = [];
		const specs = await packageProvider.discoverTestSpecs();
		specs.forEach((specs, modname)=>{
			const modItem:vscode.TestItem&{modname?:string} = controller.createTestItem(modname, modname);
			modItem.modname = modname;
			(modItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
			(modItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunChildren"));
			items.push(modItem);

			specs.forEach((spec, i)=>{
				const testItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec} = controller.createTestItem(spec.name, spec.name);
				testItem.sortText= i.toString();
				testItem.modname = modname;
				(testItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
				testItem.suiteConfig = spec;
				modItem.children.add(testItem);

				if ("matched" in spec) {
					if (spec.matched.length === 0) {
						// no valid match... error it and no run?
						(testItem.tags as vscode.TestTag[]).pop();
						testItem.error = `No scenarios match '${(spec as WildcardTestSpec<ScenarioTestSpec>).scenario}'`;
					} else {
						// matches, add them as children, flag parent as wildcard to run children
						(testItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunChildren"));
						spec.matched.forEach((match, i)=>{
							const matchItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec; match?:string } = controller.createTestItem(match, match);
							matchItem.modname = modname;
							(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("CanRun"));
							(matchItem.tags as vscode.TestTag[]).push(new vscode.TestTag("RunMatch"));
							matchItem.suiteConfig = spec;
							matchItem.match = match;
							testItem.children.add(matchItem);
						});
					}
				}
			});
		});
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
		const readOutputFile = async (filename:string)=>{
			const uri = vscode.Uri.joinPath(vscode.Uri.file(await activeVersion!.scriptOutputPath()), filename );
			return (await vscode.workspace.fs.readFile(uri)).toString();
		};

		const runOne = async (_item: vscode.TestItem&{modname?:string; suiteConfig?:TestSpec; match?:string})=>{
			const item = _item as vscode.TestItem&{modname:string; suiteConfig:TestSpec; match?:string};
			run.started(item);
			if (activeVersion) {
				const args: string[] = TestSpecArgs(item.suiteConfig, item.match);

				if (item.suiteConfig.adjustMods) {
					//TODO: adjust mods...
				}

				if (item.suiteConfig.settings) {
					//TODO: adjust settings...
				}
				const result = await activeVersion.run(args);

				if (item.suiteConfig.results) {
					switch (item.suiteConfig.results.format) {
						case "tap":
							const tap = Parser.parse(await readOutputFile(item.suiteConfig.results.filename));
							item.children.replace([]);
							tapToTestItems(tap, item, run, newChild);
							break;
					}
				}

				if (result.error) {
					run.failed(item, { message: result.stdout });
				} else {
					run.passed(item);
				}
			} else {
				run.errored(item, {message: "No Active Factorio Version"});
			}
		};

		const runItem = async (item:vscode.TestItem)=>{
			if (!item.tags.find(t=>t.id === "RunChildren")) {
				await runOne(item);
			} else {
				for (const [_id, child] of item.children) {
					await runItem(child);
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

	controller.createRunProfile("run", vscode.TestRunProfileKind.Run, runHandler, true, new vscode.TestTag("CanRun"));
	//TODO: Debug profile
}
