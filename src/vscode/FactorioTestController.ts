import * as vscode from 'vscode';
import type { ModPackageProvider } from './ModPackageProvider';
import type { FactorioVersionSelector } from './VersionSelector';
import type { Plan, Result, EventLog} from "tap-parser";
import { Parser } from "tap-parser";
import assert from 'assert';
import { TestSpecArgs, type TestSpec } from '../Test/TestSpec';

export function activate(context: vscode.ExtensionContext, packageProvider: ModPackageProvider, versionSelector:FactorioVersionSelector) {
	const controller = vscode.tests.createTestController("factorio", "Factorio");
	context.subscriptions.push(controller);

	const discoverTests = async ()=>{
		const items:vscode.TestItem[] = [];
		const suites = await packageProvider.discoverTestSuites();
		suites.forEach((suites, modname)=>{
			const modItem:vscode.TestItem&{modname?:string} = controller.createTestItem(modname, modname);
			modItem.modname = modname;
			//@ts-expect-error readonly bound incorrectly
			modItem.tags.push(new vscode.TestTag("CanRun"));
			items.push(modItem);

			suites.forEach(suite=>{
				const testItem:vscode.TestItem&{modname?:string; suiteConfig?:TestSpec} = controller.createTestItem(suite.name, suite.name);
				testItem.modname = modname;
				//@ts-expect-error readonly bound incorrectly
				testItem.tags.push(new vscode.TestTag("CanRun"));
				testItem.suiteConfig = suite;
				modItem.children.add(testItem);
			});
		});
		controller.items.replace(items);
	};

	const runHandler = async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken)=>{
		const run = controller.createTestRun(request);

		const activeVersion = await versionSelector.getActiveVersion();

		const runOne = async (_item: vscode.TestItem&{modname?:string; suiteConfig?:TestSpec})=>{
			const item = _item as vscode.TestItem&{modname:string; suiteConfig:TestSpec};
			run.started(item);
			if (activeVersion) {
				const args: string[] = TestSpecArgs(item.suiteConfig);

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
							const tapfileuri = vscode.Uri.joinPath(vscode.Uri.file(await activeVersion.scriptOutputPath()), item.suiteConfig.results.filename );
							const tap = Parser.parse((await vscode.workspace.fs.readFile(tapfileuri)).toString());
							item.children.replace([]);

							function tapToTestItems(tap: EventLog, item: vscode.TestItem, run:vscode.TestRun, newChild: (parent:vscode.TestItem, id:string, label:string)=>vscode.TestItem) {
								for (let i = 0; i < tap.length; i++) {
									const tapEvent = tap[i];
									switch (tapEvent[0]) {
										case "plan":
											const plan = tapEvent[1] as Plan;
											break;
										case "child":
											{
												const child = tapEvent[1] as EventLog;
												const subTest = tap[++i];
												assert(subTest[0] === "assert");
												const result = subTest[1] as Result;
												const tapItem = newChild(item, result.id.toString(), result.name);
												tapToTestItems(child, tapItem, run, newChild);

												if (result.ok) {
													run.passed(tapItem);
												} else {
													run.failed(tapItem, { message: "" });
												}
											}
											break;
										case "assert":
											{
												const result = tapEvent[1] as Result;

												const tapItem = newChild(item, result.id.toString(), result.name);
												if (result.ok) {
													run.passed(tapItem);
												} else {
													run.failed(tapItem, { message: "" });
												}
											}
											break;
										default:
											break;
									}
								}
							}

							tapToTestItems(tap, item, run, (parent, id, label)=>{
								const child = controller.createTestItem(id, label);
								parent.children.add(child);
								return child;
							});
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

		if (request.include) {
			for (const _item of request.include) {
				const item = _item as vscode.TestItem&{modname?:string; suiteConfig?:TestSpec};
				if (item.modname) {
					if (item.suiteConfig) {
						// run a specific test...
						await runOne(item);
					} else {
						// run all tests in a mod...
						for (const [_id, child] of item.children) {
							await runOne(child);
						}
					}
				}
			};
		} else {
			// discover and run everything!
			await discoverTests();
			for (const [_modname, moditem] of controller.items) {
				for (const [_id, child] of moditem.children) {
					await runOne(child);
				}
			}
		}
		run.end();
	};

	controller.refreshHandler = discoverTests;
	context.subscriptions.push(packageProvider.onDidChangeTreeData(()=>{ void discoverTests(); }));

	controller.createRunProfile("run", vscode.TestRunProfileKind.Run, runHandler, true, new vscode.TestTag("CanRun"));
	//TODO: Debug profile
}
