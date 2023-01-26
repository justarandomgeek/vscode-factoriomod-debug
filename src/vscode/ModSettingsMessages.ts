import type { ModSettingsScopeName, ModSettingsValue } from "../ModSettings";

export interface ModSettingsMessages {
	ready: {}
	init: {
		version: string
		saves_ints: boolean
		settings: string
		editable: boolean
	}
	edit: {
		scope: ModSettingsScopeName
		name: string
		value: ModSettingsValue<string>|{type:"none"; value?:undefined}
	}
}

export function ToBigIntValue(value:ModSettingsValue<string>):ModSettingsValue<bigint> {
	if (value.type === "int") {
		return { type: "int", value: BigIntReviver("", value.value) };
	}
	return value;
}

export function FromBigIntValue(value:ModSettingsValue<bigint>):ModSettingsValue<string> {
	if (value.type === "int") {
		return { type: "int", value: BigIntReplacer("", value.value) };
	}
	return value;
}


export function BigIntReplacer(key:string, value:bigint):string;
export function BigIntReplacer<T extends string|number|boolean>(key:string, value:T):T;
export function BigIntReplacer(key:string, value:any) {
	if (typeof value === 'bigint') {
		// a string that is unlikely to have been used as a real value...
		return `jsonbigint\x01\x02 ${value}n`;
	}
	return value;
}

export function BigIntReviver(key:string, value:string):bigint;
export function BigIntReviver<T extends string|number|boolean>(key:string, value:T):T;
export function BigIntReviver(key:string, value:any) {
	if (typeof value === "string") {
		const match = value.match(/^jsonbigint\x01\x02 (\d+)n$/);
		if (match) {
			return BigInt(match[1]);
		}
	}
	return value;
}