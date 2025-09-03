import type { SavedLuaTable, SavedLuaTableWithMeta, SavedLuaValue } from "./ScriptDat";

export interface PartailSavedLuaTable extends Omit<SavedLuaTable, "values"> {
	values_count: number
}
export interface PartailSavedLuaTableWithMeta extends Omit<SavedLuaTableWithMeta, "values"> {
	values_count: number
}

export type PartialSavedLuaValue =
	Exclude<SavedLuaValue, SavedLuaTable>|
	PartailSavedLuaTable;

export type PartailSavedLuaTableValues = {
	key: PartialSavedLuaValue
	value: PartialSavedLuaValue
}[];

export interface ScriptDatMessages {
	ready: object
	init: {
		readonly version: string
		readonly data: {
			readonly [modname:string]:PartialSavedLuaValue
		}
	}
	fetch: {
		readonly modname:string
		readonly gcid:number
		readonly index?:number // index in values array - *not* key!
		readonly count?:number
	}
	values: {
		readonly modname:string
		readonly gcid:number
		readonly values:PartailSavedLuaTableValues
	}
}

export function SavedLuaValueAsPartial(value:SavedLuaValue):PartialSavedLuaValue {
	switch (value.type) {
		case "Table":
		case "TableWithMeta":
			return Object.assign({}, value, {
				values: undefined,
				values_count: value.values.length,
			});

		default:
			return value;
	}
}