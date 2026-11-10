import { readdirGlob } from 'readdir-glob';
import { ModSettings, type ModSettingsScopeName, type ModSettingsValue } from '../ModSettings/ModSettings';
import { URI, Utils } from 'vscode-uri';
import type { fsAccessor } from '../cli/util';
import type { ModInfo } from '../vscode/ModPackage';
import { Parser } from "tap-parser";
import type { ActiveFactorioVersion } from '../vscode/FactorioVersion';
import { ModManager } from '../ModManager';
import { BufferStream } from '../Util/BufferStream';
import { tapToTestItems } from './TAP';
import type { TestItem, TestRun } from 'vscode';

export interface BaseTestSpec {
	name: string // test suite name, unique within mod
	ticks?: number
	arg?: string

	factorioArgs?: string[]

	adjustMods?: { [modname: string]: string | boolean }
	disableUnlistedMods?: boolean
	allowDisableBaseMod?: boolean

	settings?: { scope: ModSettingsScopeName; name: string; value: ModSettingsValue<string> | { type: "none"; value?: undefined } }[]

	results?: { format: "tap"; filename: string }
}
;

export interface SaveTestSpec extends BaseTestSpec {
	save: string
}
export interface ScenarioTestSpec extends BaseTestSpec {
	scenario: string
}

export type TestSpec = SaveTestSpec | ScenarioTestSpec;

export type WildcardTestSpec<T = TestSpec> = T & {
	matched: { name:string; path: string }[]
};

export function TestSpecArgs(spec:TestSpec, match?:string) {
	const args: string[] = [];
	if ("scenario" in spec && spec.scenario) {
		args.push("--test-scenario", match ?? spec.scenario);
	}
	if ("save" in spec && spec.save) {
		args.push("--test-save", match ?? spec.save);
	}

	if (spec.ticks) {
		args.push("--test-ticks", spec.ticks.toString());
	}
	if (spec.arg) {
		args.push("--test-arg", spec.arg);
	}

	if (spec.factorioArgs) {
		args.push(...spec.factorioArgs);
	}
	return args;
}

export async function discoverTestSpecs(modUri:URI, fs:typeof fsAccessor) {
	try {
		const info: ModInfo = JSON.parse((await fs.readFile(Utils.joinPath(modUri, "../info.json"))).toString());
		const specs: (WildcardTestSpec | TestSpec)[] = JSON.parse((await fs.readFile(Utils.joinPath(modUri, "../tests.json"))).toString());
		//TODO: validate it against schema?
		for (const spec of specs) {
			if ("scenario" in spec && spec.scenario) {
				//scenarios: parse modname, glob scenario name
				const match = spec.scenario.match(/(?:(.*?)\/)?(.*)/)!;
				const modname: string | undefined = match[1]; // undefined for user scenarios
				const scenario = match[2];
				if (modname === info.name) { // for now only expand in own package...
					const matched = await new Promise<{ name: string; path: string }[]>((resolve, reject)=>{
						const matched: { name: string; path: string }[] = [];
						const globber = readdirGlob(Utils.joinPath(modUri, "../scenarios").fsPath, {
							pattern: scenario,
						});
						globber.on('match', (match: { relative: string; absolute: string })=>{
							matched.push({ name: `${modname}/${match.relative}`, path: match.absolute });
						});
						globber.on('error', (err)=>{ reject(err); });
						globber.on('end', ()=>{ resolve(matched); });
					});

					const wspec = spec as WildcardTestSpec<ScenarioTestSpec>;
					wspec.matched = matched;
				}
			} else if ("save" in spec && spec.save) {
				//saves: resolve from mod root, give factorio absolute path/list relative in test tree
				const matched = await new Promise<{ name: string; path: string }[]>((resolve, reject)=>{
					const matched: { name: string; path: string }[] = [];
					const pattern = [];
					if (spec.save.endsWith(".zip") || spec.save.endsWith("/")) {
						pattern.push(spec.save);
					} else {
						pattern.push(spec.save + ".zip");
						pattern.push(spec.save + "/");
					}
					const globber = readdirGlob(Utils.joinPath(modUri, "../").fsPath, { pattern });
					globber.on('match', (match: { relative: string; absolute: string })=>{
						matched.push({ name: match.relative, path: match.absolute });
					});
					globber.on('error', (err)=>{ reject(err); });
					globber.on('end', ()=>{ resolve(matched); });
				});
				const wspec = spec as WildcardTestSpec<SaveTestSpec>;
				wspec.matched = matched;
			}
		}
		return specs;
	} catch (error) {
		return undefined;
	}
}

export async function runTestSpec(activeVersion:ActiveFactorioVersion|undefined, fs:typeof fsAccessor, item: TestItem, run:TestRun, newChild: (parent:TestItem, id:string, label:string)=>TestItem, suiteConfig:TestSpec, match?:string) {
	run.started(item);
	if (activeVersion) {
		const args: string[] = TestSpecArgs(suiteConfig, match);

		if (suiteConfig.adjustMods) {
			const manager = new ModManager(await activeVersion.defaultModsPath());
			await manager.Loaded;
			if (suiteConfig.disableUnlistedMods) {
				manager.disableAll();
			}
			for (const modname in suiteConfig.adjustMods) {
				manager.set(modname, suiteConfig.adjustMods[modname]);
			}
			if (!suiteConfig.allowDisableBaseMod) { manager.set("base", true); }
			await manager.write();
		}

		if (suiteConfig.settings) {
			const modSettingsUri = Utils.joinPath(URI.file(await activeVersion.defaultModsPath()), "mod-settings.dat");
			const settings = new ModSettings(new BufferStream(await fs.readFile(modSettingsUri)));
			for (const element of suiteConfig.settings) {
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
			await fs.writeFile(modSettingsUri, settings.save());
		}

		const result = await activeVersion.run(args);

		if (suiteConfig.results) {
			switch (suiteConfig.results.format) {
				case "tap":
					const uri = Utils.joinPath(URI.file(await activeVersion.scriptOutputPath()), suiteConfig.results.filename );
					const tap = Parser.parse((await fs.readFile(uri)).toString());
					tapToTestItems(tap, item, run, newChild);
					break;
			}
		}

		if (result.error) {
			run.failed(item, { message: result.stdout });
		} else {
			run.appendOutput(result.stdout, undefined, item);
			run.passed(item);
		}
	} else {
		run.errored(item, {message: "No Active Factorio Version"});
	}
}
