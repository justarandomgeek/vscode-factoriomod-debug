import type { ModSettingsScopeName, ModSettingsValue } from '../ModSettings/ModSettings';

export interface BaseTestSpec {
	adjustMods?: { [modname: string]: string | boolean }
	disableUnlistedMods?: boolean
	allowDisableBaseMod?: boolean

	settings?: { scope: ModSettingsScopeName; name: string; value: ModSettingsValue<string> | { type: "none"; value?: undefined } }[]

	name: string // test suite name, unique within mod
	ticks?: number
	arg?: string

	factorioArgs?: string[]

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

export type WildcardTestSpec = TestSpec & {
	matched: string[]
};

export function TestSpecArgs(spec:TestSpec, match?:string) {
	const args: string[] = [];
	if ("scenario" in spec && spec.scenario) {
		args.push("--test-scenario", spec.scenario);
	}
	if ("save" in spec && spec.save) {
		args.push("--test-save", spec.save);
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
