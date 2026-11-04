import * as vscode from 'vscode';
import type { ModPackageProvider } from './ModPackageProvider';
import type { FactorioVersionSelector } from './VersionSelector';
import { Parser } from "tap-parser";
import { TestSpecArgs, type TestSpec } from '../Test/TestSpec';
import { tapToTestItems } from '../Test/TAP';
import { BufferStream } from '../Util/BufferStream';
import { ModSettings } from '../ModSettings/ModSettings';
import { ModManager } from '../ModManager';

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
								let testUri = vscode.Uri.file(match.path);
								try {
									const controlUri = vscode.Uri.joinPath(testUri, "control.lua");
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
					const manager = new ModManager(await activeVersion.defaultModsPath());
					await manager.Loaded;
					if (item.suiteConfig.disableUnlistedMods) {
						manager.disableAll();
					}
					for (const modname in item.suiteConfig.adjustMods) {
						manager.set(modname, item.suiteConfig.adjustMods[modname]);
					}
					if (!item.suiteConfig.allowDisableBaseMod) { manager.set("base", true); }
					await manager.write();
				}

				if (item.suiteConfig.settings) {
					const modSettingsUri = vscode.Uri.joinPath(vscode.Uri.file(await activeVersion.defaultModsPath()), "mod-settings.dat");
					const settings = new ModSettings(new BufferStream(await vscode.workspace.fs.readFile(modSettingsUri)));
					for (const element of item.suiteConfig.settings) {
						switch (element.value.type) {
							case 'none':
								settings.set(element.scope, element.name, undefined);
								break;
							case 'int':
								settings.set(element.scope, element.name, { type: "int", value: BigInt(element.value.value) });
								break;
							default:
								settings.set(element.scope, element.name, element.value);
								break;
						}
					}
					await vscode.workspace.fs.writeFile(modSettingsUri, settings.save());
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
			if (item.tags.find(t=>t.id === "CanRun")) {
				if (!item.tags.find(t=>t.id === "RunChildren")) {
					await runOne(item);
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
