import * as vscode from 'vscode';
import type { ModSettingsScopeName, ModSettingsValue } from '../ModSettings/ModSettings';
import type { ModPackageProvider } from './ModPackageProvider';
import type { FactorioVersionSelector } from './VersionSelector';
import type { Plan, Result, EventLog} from "tap-parser";
import { Parser } from "tap-parser";
import assert from 'assert';

export interface TestSuite {
	adjustMods?: {[modname:string]:string|boolean}
	disableUnlistedMods?:boolean
	allowDisableBaseMod?:boolean

	settings?: {scope: ModSettingsScopeName; name: string; value: ModSettingsValue<string>|{type:"none"; value?:undefined}}[]

	name:string // test suite name, unique within mod
	ticks?:number
	arg?:string

	factorioArgs?:string[]

	results?: {format:"tap"; filename:string}
};

export interface SaveTestSuite extends TestSuite {
	save:string
}
export interface ScenarioTestSuite extends TestSuite {
	scenario:string
}

export type TestSuiteList = (SaveTestSuite|ScenarioTestSuite)[];

export function activate(context: vscode.ExtensionContext, packageProvider: ModPackageProvider, versionSelector:FactorioVersionSelector) {
	const controller = vscode.tests.createTestController("factorio", "Factorio");
	context.subscriptions.push(controller);

	const discoverTests = async ()=>{
		const items:vscode.TestItem[] = [];
		const suites = await packageProvider.discoverTestSuites();
		suites.forEach((suites, modname)=>{
			const modItem:vscode.TestItem&{modname?:string} = controller.createTestItem(modname, modname);
			modItem.modname = modname;
			items.push(modItem);

			suites.forEach(suite=>{
				//TODO: if save/scenario is glob, look for matches and list those...
				const testItem:vscode.TestItem&{modname?:string; suiteConfig?:SaveTestSuite|ScenarioTestSuite} = controller.createTestItem(suite.name, suite.name);
				testItem.modname = modname;
				testItem.suiteConfig = suite;
				modItem.children.add(testItem);
			});
		});
		controller.items.replace(items);
	};

	const runHandler = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken)=>{
		return startTestRun(request);
	};

	const startTestRun = async (request: vscode.TestRunRequest)=>{
		const run = controller.createTestRun(request);

		const activeVersion = await versionSelector.getActiveVersion();

		const runOne = async (_item: vscode.TestItem&{modname?:string; suiteConfig?:SaveTestSuite|ScenarioTestSuite})=>{
			const item = _item as vscode.TestItem&{modname:string; suiteConfig:SaveTestSuite|ScenarioTestSuite};
			run.started(item);
			if (activeVersion) {
				const args: string[] = [];
				if ("scenario" in item.suiteConfig && item.suiteConfig.scenario) {
					args.push("--test-scenario", item.suiteConfig.scenario);
				}
				if ("save" in item.suiteConfig && item.suiteConfig.save) {
					args.push("--test-save", item.suiteConfig.save);
				}

				if (item.suiteConfig.ticks) {
					args.push("--test-ticks", item.suiteConfig.ticks.toString());
				}
				if (item.suiteConfig.arg) {
					args.push("--test-arg", item.suiteConfig.arg);
				}

				if (item.suiteConfig.factorioArgs) {
					args.push(...item.suiteConfig.factorioArgs);
				}

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

							const tapToTestItems = (tap:EventLog, item:vscode.TestItem)=>{
								for (let i = 0; i < tap.length; i++) {
									const tapEvent = tap[i];
									switch (tapEvent[0]) {
										case "plan":
											const plan = tapEvent[1] as Plan;
											console.log(plan);
											break;
										case "child":
											{
												const child = tapEvent[1] as EventLog;
												const subTest = tap[++i];
												assert(subTest[0]==="assert");
												const result = subTest[1]  as Result;
												const tapItem = controller.createTestItem(result.id.toString(), result.name);
												item.children.add(tapItem);
												run.started(tapItem);

												tapToTestItems(child, tapItem);

												if (result.ok) {
													run.passed(tapItem);
												} else {
													run.failed(tapItem, {message: ""});
												}
											}
											break;
										case "assert":
											{
												const result = tapEvent[1]  as Result;

												const tapItem = controller.createTestItem(result.id.toString(), result.name);
												item.children.add(tapItem);
												if (result.ok) {
													run.passed(tapItem);
												} else {
													run.failed(tapItem, {message: ""});
												}
											}
											break;
										default:
											break;
									}
								}
							};

							tapToTestItems(tap, item);
							console.log(tap);
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
				let item = _item as vscode.TestItem&{modname?:string; suiteConfig?:SaveTestSuite|ScenarioTestSuite};
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
				} else {
					// or if it was a deep result, walk up until we find the suite to re-run...
					while (item.parent && !item.suiteConfig) {
						item = item.parent;
					}
					if (item.suiteConfig) {
						await runOne(item);
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

	controller.createRunProfile("run", vscode.TestRunProfileKind.Run, runHandler, true);


}