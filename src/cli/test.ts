import * as os from "os";
import * as fsp from 'fs/promises';
import { program } from 'commander';

import { URI, Utils } from 'vscode-uri';
import { fsAccessor } from './util';
import type { LocalFactorioVersion } from '../vscode/FactorioVersion';
import { ActiveFactorioVersion } from '../vscode/FactorioVersion';
import { ApiDocGenerator } from '../ApiDocs/ApiDocGenerator';
import { discoverTestSpecs, runTestSpec, type TestRunInterface as TestRunInterface } from "../Test/TestSpec";
import type { MarkdownString, Range, TestItem, TestItemCollection, TestTag, Uri } from "vscode";

class TestItemChildren implements TestItemCollection {
	private parent?: TestItem;
	private items: TestItem[] = [];
	constructor(parent?:TestItem) {
		this.parent = parent;
	}
	public get size(): number {
		return this.items.length;
	}
	replace(items: readonly TestItem[]): void {
		for (const item of items) {
			///@ts-expect-error reparent
			item.parent = this.parent;
		}
		for (const item of this.items) {
			///@ts-expect-error reparent
			item.parent = undefined;
		}
		this.items = items as TestItem[];
	}
	forEach(callback: (item: TestItem, collection: TestItemCollection) => unknown, thisArg?: any): void {
		this.items.forEach((item)=>{ callback(item, this); }, thisArg);
	}
	add(item: TestItem): void {
		///@ts-expect-error reparent
		item.parent = this.parent;
		const idx = this.items.findIndex(ti=>ti.id === item.id);
		if (idx >= 0) {
			///@ts-expect-error reparent
			this.items[idx].parent = undefined;
			this.items[idx] = item;
		} else {
			this.items.push(item);
		}
	}
	delete(itemId: string): void {
		throw new Error("Method not implemented.");
	}
	get(itemId: string): TestItem | undefined {
		return this.items.find(ti=>ti.id === itemId);
	}
	*[Symbol.iterator](): Iterator<[id: string, testItem: TestItem], any, any> {
		for (const item of this.items) {
			yield [item.id, item];
		}
	}
}

class _TestItem implements TestItem {
	id: string;
	uri: Uri | undefined;
	children: TestItemCollection;
	parent: TestItem | undefined = undefined;
	tags: readonly TestTag[] = [];
	canResolveChildren: boolean = false;
	busy: boolean = false;
	label: string;
	description?: string | undefined;
	sortText?: string | undefined;
	range: Range | undefined;
	error: string | MarkdownString | undefined;

	constructor(id:string, label:string) {
		this.id = id;
		this.label = label;
		this.children= new TestItemChildren(this);
	}
}

function fullTestID(item:TestItem):string {
	if (item.parent) {
		return `${fullTestID(item.parent)}.${item.id}`;
	}
	return item.id;
}

program.command("test <factorioPath>")
	.description("Run tests from tests.json")
	.option("-d, --docs <docsPath>", "path to runtime-api.json")
	.option("-c, --config <configPath>", "path to config.ini")
	.action(async (factorioPath:string, options:{ docs?:string; config?:string })=>{
		const fv: LocalFactorioVersion = {
			name: "standalone",
			factorioPath: factorioPath,
			configPath: options.config,
			docsPath: options.docs,
		};
		const docsPath = Utils.joinPath(URI.file(factorioPath),
			fv.docsPath ? fv.docsPath :
			(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
			"../../../doc-html/runtime-api.json"
		);
		const docsjson = await fsp.readFile(docsPath.fsPath, "utf8");
		const activeVersion = new ActiveFactorioVersion(fsAccessor, fv, new ApiDocGenerator(docsjson));

		// start a single session that communicates via stdin/stdout
		const specs = await discoverTestSpecs( Utils.joinPath(URI.file(process.cwd()), "info.json"), fsAccessor);

		let passed = true;
		const run:TestRunInterface = {
			started(test) {
				console.log("started", fullTestID(test));
			},
			errored(test, message, duration) {
				console.log("errored", fullTestID(test));
				passed = false;
			},
			passed(test, duration) {
				console.log("passed", fullTestID(test));
			},
			failed(test, message, duration) {
				console.log("failed", fullTestID(test));
				passed = false;
			},
			appendOutput(output, location, test) {
				//console.log("output", output, location, test);
			},
		};
		const newChild = (parent:TestItem|undefined, id:string, label:string):TestItem=>{
			const child = new _TestItem(id, label);
			if (parent) {
				parent.children.add(child);
			}
			return child;
		};

		const rootItem = newChild(undefined, "test", "test");
		for (const spec of specs!) {
			const specItem = newChild(rootItem, spec.name, spec.name);
			if ("matched" in spec) {
				if ("scenario" in spec && spec.scenario) {
					if (spec.matched.length === 0) {
						// no valid match... error it and no run?
						run.errored(specItem, {message: `No scenarios match '${spec.scenario}'`});
					} else {
						// matches, add them as children, flag parent as wildcard to run children
						for (const match of spec.matched) {
							const item = newChild(specItem, match.name, match.name);
							await runTestSpec(activeVersion, fsAccessor, item, run, newChild, spec, match.name);
						}
					}
				} else if ("save" in spec && spec.save) {
					if (spec.matched.length === 0) {
						// no valid match... error it and no run?
						run.errored(specItem, {message: `No saves match '${spec.save}'`});
					} else {
						// matches, add them as children, flag parent as wildcard to run children
						for (const match of spec.matched) {
							const item = newChild(specItem, match.name, match.name);
							await runTestSpec(activeVersion, fsAccessor, item, run, newChild, spec, match.path);
						}
					}
				}
			}
		}
		process.exitCode = passed ? 0 : 1;
	});
