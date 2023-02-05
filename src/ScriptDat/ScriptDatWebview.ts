import "./ScriptDatWebview.css";
import type {} from "vscode-webview";
import type { PartailSavedLuaTable, PartailSavedLuaTableValues, PartailSavedLuaTableWithMeta, PartialSavedLuaValue, ScriptDatMessages } from "./ScriptDatMessages";
import type { SavedLuaObject } from "./ScriptDat";

const vscode = acquireVsCodeApi();

function postMessage<K extends keyof ScriptDatMessages>(type: K, body: ScriptDatMessages[K]): void {
	vscode.postMessage({ type, body });
}

interface ScriptDatMessageEventData<K extends keyof ScriptDatMessages = keyof ScriptDatMessages> {
	type: K
	body: ScriptDatMessages[K]
}

const elements = {
	version: document.getElementById("version")!,
	root: document.getElementById("root")!,
};

function luaPlainValue(type:string, value:string) {
	const span = document.createElement("span");
	span.classList.add(type);
	span.append(value);
	return span;
}

function luaAsPlainValue(modname:string, value:PartialSavedLuaValue) {
	switch (value.type) {
		case "Nil":
		case "BoolFalse":
		case "BoolTrue":
		case "Number":
		case "String":
		case "ExistingGCObject":
			return luaValue(modname, value);

		case "Table":
		case "TableWithMeta":
			return luaPlainValue("table", `${value.type} [${value.id}]`);

		case "LuaObject":
			return luaPlainValue("luaobject", `${(value.value as {type:string}).type} [${value.id}]`);
	}
}
const isplain = ["Nil", "BoolFalse", "BoolTrue", "Number", "String", "ExistingGCObject"];

function luaTableEntry(modname:string, prefix:string, value:PartialSavedLuaValue) {
	const details = document.createElement("details");
	const summary = document.createElement("summary");

	const plain = luaAsPlainValue(modname, value);

	summary.append(prefix, plain.cloneNode(true));
	details.append(summary);
	if (isplain.includes(value.type)) {
		details.classList.add("plain");
		return {plain};
	} else {
		details.append(luaValue(modname, value));
	}


	return {details, plain};
}

function luaTableKV(modname:string, kv:PartailSavedLuaTableValues[1]) {
	const details = document.createElement("details");
	const summary = document.createElement("summary");
	summary.classList.add("keyvalue");

	const key = luaTableEntry(modname, "Key: ", kv.key);
	const value = luaTableEntry(modname, "Value: ", kv.value);

	summary.append(key.plain, ` = `, value.plain);
	details.append(summary);

	if (!key.details || !value.details) {
		if (!key.details && !value.details) {
			details.classList.add("plain");
		}
		const inner = key.details ?? value.details;
		if (inner) {
			inner.firstChild?.remove();
			inner.childNodes.forEach(n=>details.append(n));
		}
	} else {
		details.append(key.details, value.details);
	}
	return details;
}

function luaTable(modname:string, table:PartailSavedLuaTable) {
	const div = document.createElement("div");
	div.id = `${modname}_gc_${table.id}`;
	div.classList.add("fetch");

	if (table.type==="TableWithMeta") {
		const meta = document.createElement("details");
		meta.classList.add("meta");
		const msumm = document.createElement("summary");
		const span = document.createElement("span");
		span.classList.add("meta");
		span.append((table as PartailSavedLuaTableWithMeta).meta);
		msumm.append("Meta: ", span);
		meta.append(msumm);
		div.append(meta);
	}
	return div;
}

function finishTable(modname:string, id:number, values:PartailSavedLuaTableValues) {
	const div = document.getElementById(`${modname}_gc_${id}`)!;
	const details = div.closest("details")!;
	details.classList.remove("loading");
	if (values.length === 0) {
		const meta = div.querySelector(".meta");
		if (!meta) {
			details.classList.add("empty");
		}
	} else {
		for (const kv of values) {
			div.append(luaTableKV(modname, kv));
		}
	}
}

function luaObject(modname:string, obj:SavedLuaObject) {
	const details = document.createElement("pre");
	details.id = `${modname}_gc_${obj.id}`;
	details.classList.add("luaobject");
	details.append(JSON.stringify(obj.value));

	return details;
}

function luaValue(modname:string, value:PartialSavedLuaValue) : HTMLElement {
	switch (value.type) {
		case "Nil":
			return luaPlainValue("nil", "nil");
		case "BoolFalse":
			return luaPlainValue("bool", "false");
		case "BoolTrue":
			return luaPlainValue("bool", "true");
		case "Number":
			return luaPlainValue("number", value.value.toString());
		case "String":
			return luaPlainValue("string", value.value);
		case "ExistingGCObject":
			return luaPlainValue("existing", `Ref [${value.id}]`);

		case "Table":
		case "TableWithMeta":
			return luaTable(modname, value);

		case "LuaObject":
			return luaObject(modname, value);
	}
}

function modRoot(name:string, value:PartialSavedLuaValue) {
	const details = document.createElement("details");
	const summary = document.createElement("summary");
	const modname = document.createElement("span");
	modname.classList.add("modname");
	modname.append(name);
	summary.append(modname, ` = `, luaAsPlainValue(name, value));
	details.append(summary);
	details.append(luaValue(name, value));

	if ("id" in value) {
		details.id = `${name}_gc_${value.id}`;
		details.classList.add("fetch");
	}
	return details;
}

window.addEventListener('click', e=>{
	const target = e.target as HTMLElement;
	const details = target.closest("details");
	if (details) {
		const fetch = details.querySelector(".fetch");
		if (fetch && fetch.parentElement === details) {
			fetch.classList.remove("fetch");
			details.classList.add("loading");
			const id = fetch.id.match(/^(.+)_gc_(.+)$/);
			if (id) {
				postMessage("fetch", { modname: id[1], gcid: Number(id[2])});
			}
		}
	}
});

window.addEventListener('message', async <K extends keyof ScriptDatMessages>(e:MessageEvent<ScriptDatMessageEventData<K>>)=>{

	const { type, body } = e.data;
	switch (type) {
		case 'init':
			const initbody = body as ScriptDatMessages['init'];
			elements.version.innerText = initbody.version;
			const root = elements.root;
			root.replaceChildren();
			for (const modname in initbody.data) {
				root.append(modRoot(modname, initbody.data[modname]));
			}
			break;
		case 'values':
			const valuesbody = body as ScriptDatMessages['values'];
			finishTable(valuesbody.modname, valuesbody.gcid, valuesbody.values);
			break;
	}
});

// Signal to VS Code that the webview is initialized.
postMessage('ready', {});