import type { SavedLuaTable, SavedLuaTableWithMeta, SavedLuaValue } from "./ScriptDat";

export type PartailSavedLuaTable = Omit<SavedLuaTable, "values">;
export type PartailSavedLuaTableWithMeta = Omit<SavedLuaTableWithMeta, "values">;

export type PartialSavedLuaValue =
	Exclude<SavedLuaValue, SavedLuaTable>|
	PartailSavedLuaTable;

export type PartailSavedLuaTableValues = {
	key: PartialSavedLuaValue
	value: PartialSavedLuaValue
}[];

export interface ScriptDatMessages {
	ready: {}
	init: {
		readonly version: string
		readonly data: {
			readonly [modname:string]:PartialSavedLuaValue
		}
	}
	fetch: {
		readonly modname:string
		readonly gcid:number
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
			return Object.assign({}, value, {values: undefined});

		default:
			return value;
	}
}