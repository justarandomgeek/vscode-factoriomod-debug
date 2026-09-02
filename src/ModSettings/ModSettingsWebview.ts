import "./ModSettingsWebview.css";

import type {} from "vscode-webview";
import type { ModSettingsData, ModSettingsScopeName, ModSettingsValue } from "../ModSettings/ModSettings";
import type { ModSettingsMessages } from "./ModSettingsMessages";
import { BigIntReviver, FromBigIntValue } from "./ModSettingsMessages";

import type { VscodeButton, VscodeTextfield, VscodeCheckbox, VscodeSingleSelect, VscodeOption } from "@vscode-elements/elements";
///@ts-expect-error unused
import { VscodeTabs, VscodeTabHeader, VscodeTabPanel, VscodeTable, VscodeTableBody, VscodeTableRow, VscodeTableCell } from "@vscode-elements/elements";

const vscode = acquireVsCodeApi();

function postMessage<K extends keyof ModSettingsMessages>(type: K, body: ModSettingsMessages[K]): void {
	vscode.postMessage({ type, body });
}

const ModSettingsScopeNames = ["startup", "runtime-global", "runtime-per-user"] as ModSettingsScopeName[];

interface ModSettingsMessageEventData<K extends keyof ModSettingsMessages = keyof ModSettingsMessages> {
	type: K
	body: ModSettingsMessages[K]
}

let settings:ModSettingsData;

const elements = {
	version: document.getElementById("version")!,
};

const templates = {
	setting_bool: document.getElementById("setting-bool")! as HTMLTemplateElement,
	setting_number: document.getElementById("setting-number")! as HTMLTemplateElement,
	setting_string: document.getElementById("setting-string")! as HTMLTemplateElement,
	setting_color: document.getElementById("setting-color")! as HTMLTemplateElement,
	setting_add: document.getElementById("setting-add")! as HTMLTemplateElement,
};

function addSetting(button:VscodeButton) {
	const scopebody = button.closest("vscode-table-body")!;
	const scope = scopebody.id as ModSettingsScopeName;

	const row = button.closest("vscode-table-row")!;
	const namefield = row.querySelector(".setting-add-name") as VscodeTextfield;
	if (!namefield.value) { return; }
	if (document.getElementById(namefield.value)) { return; }
	const typefield = row.querySelector(".setting-add-type") as VscodeSingleSelect;
	let value:ModSettingsValue;
	switch (typefield.value as ModSettingsValue["type"]) {
		case "string":
			value = { type: "string", value: ""};
			break;
		case "number":
			value = { type: "number", value: 0};
			break;
		case "int":
			value = { type: "int", value: 0n};
			break;
		case "bool":
			value = { type: "bool", value: false};
			break;
		case "color":
			value = { type: "color", value: {r: 0, g: 0, b: 0, a: 1}};
			break;
	}
	settings[scope][namefield.value] = value;
	row.before(settingNode(namefield.value, value));
	postMessage("edit",  {scope: scope, name: namefield.value, value: FromBigIntValue(value) });
	namefield.value = "";
}

function deleteSetting(button:VscodeButton) {
	const scopebody = button.closest("vscode-table-body")!;
	const scope = scopebody.id as ModSettingsScopeName;
	const row = button.closest("vscode-table-row")!;
	const key = row.id;
	row.remove();
	delete settings[scope][key];
	postMessage("edit",  {scope: scope, name: key, value: { type: "none" }});
}

function settingNode(key:string, value:ModSettingsValue):DocumentFragment {
	let node:DocumentFragment;
	switch (value.type) {
		case "bool":
		{
			node = templates.setting_bool.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("vscode-table-row")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as VscodeCheckbox;

			row.id = key;
			header.append(key);
			field.checked = value.value;
			field.addEventListener("change", (ev)=>{
				const target = ev.target as VscodeCheckbox;
				const scope = target.closest("vscode-table-body")!.id as ModSettingsScopeName;
				const key = target.closest("vscode-table-row")!.id;
				const value = settings[scope][key] as ModSettingsValue & {type:"bool"};
				value.value = target.checked;
				postMessage("edit", {scope: scope, name: key, value: value});
			});
			break;
		}
		case "int":
		case "number":
		{
			node = templates.setting_number.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("vscode-table-row")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as VscodeTextfield;

			row.id = key;
			header.append(key);
			field.value = value.value.toString();
			field.addEventListener("change", (ev)=>{
				const target = ev.target as VscodeTextfield;
				const scope = target.closest("vscode-table-body")!.id as ModSettingsScopeName;
				const key = target.closest("vscode-table-row")!.id;
				const value = settings[scope][key];
				switch (value.type) {
					case "int":
						try {
							value.value = BigInt.asIntN(64, BigInt(target.value));
						} catch (error) {
							target.value = value.value.toString();
							return;
						}
						break;
					case "number":
						value.value = Number(target.value);
						target.value = value.value.toString();
						break;
				}
				postMessage("edit",  {scope: scope, name: key, value: FromBigIntValue(value)});
			});
			break;
		}
		case "string":
		{
			node = templates.setting_string.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("vscode-table-row")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as VscodeTextfield;

			row.id = key;
			header.append(key);
			field.value = value.value;
			field.addEventListener("change", (ev)=>{
				const target = ev.target as VscodeTextfield;
				const scope = target.closest("vscode-table-body")!.id as ModSettingsScopeName;
				const key = target.closest("vscode-table-row")!.id;
				const value = settings[scope][key];
				value.value = target.value;
				postMessage("edit",  {scope: scope, name: key, value: FromBigIntValue(value)});
			});
			break;
		}
		case "color":
		{
			node = templates.setting_color.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("vscode-table-row")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const cfield = node.querySelector(".setting-color-value") as HTMLInputElement;
			const afield = node.querySelector(".setting-a-value") as VscodeTextfield;

			row.id = key;
			header.append(key);
			cfield.value = `#${Math.round(value.value.r*255).toString(16).padStart(2, '0')}${Math.round(value.value.g*255).toString(16).padStart(2, '0')}${Math.round(value.value.b*255).toString(16).padStart(2, '0')}`;
			cfield.addEventListener("change", (ev)=>{
				const target = ev.target as VscodeTextfield;
				const scope = target.closest("vscode-table-body")!.id as ModSettingsScopeName;
				const key = target.closest("vscode-table-row")!.id;
				const value = settings[scope][key] as ModSettingsValue & {type:"color"};
				const match = target.value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)!;
				value.value.r = parseInt(match[1], 16)/255;
				value.value.g = parseInt(match[2], 16)/255;
				value.value.b = parseInt(match[3], 16)/255;
				postMessage("edit",  {scope: scope, name: key, value: FromBigIntValue(value)});
			});
			afield.value = value.value.a.toString();
			afield.addEventListener("change", (ev)=>{
				const target = ev.target as VscodeTextfield;
				const scope = target.closest("vscode-table-body")!.id as ModSettingsScopeName;
				const key = target.closest("vscode-table-row")!.id;
				const value = settings[scope][key] as ModSettingsValue & {type:"color"};
				value.value.a = Number(target.value);
				value.value.a = Math.max(0, Math.min(1, value.value.a));
				target.value = value.value.a.toString();
				postMessage("edit",  {scope: scope, name: key, value: FromBigIntValue(value)});
			});
			break;
		}
	}

	node.querySelector(".setting-delete")?.addEventListener("click", (ev)=>{
		const target = ev.target as HTMLElement;
		const button = target.closest<VscodeButton>("vscode-button")!;
		deleteSetting(button);
	});
	return node;
}

window.addEventListener('message', <K extends keyof ModSettingsMessages>(e:MessageEvent<ModSettingsMessageEventData<K>>)=>{

	const { type, body } = e.data;
	switch (type) {
		case 'init':
			const initbody = body as ModSettingsMessages['init'];
			settings = JSON.parse(initbody.settings, BigIntReviver);
			elements.version.innerText = initbody.version;

			const typesel = templates.setting_add.content.querySelector(".setting-add-type") as VscodeSingleSelect;
			(typesel.children[3] as VscodeOption).hidden = !initbody.saves_ints;

			for (const templatename in templates) {
				const template = templates[templatename as keyof typeof templates];
				template.content.querySelectorAll<VscodeTextfield>("vscode-textfield").forEach(b=>b.disabled = !initbody.editable);
				template.content.querySelectorAll<VscodeCheckbox>("vscode-checkbox").forEach(b=>b.disabled = !initbody.editable);
				template.content.querySelectorAll<VscodeSingleSelect>("vscode-single-select").forEach(b=>b.disabled = !initbody.editable);
				template.content.querySelectorAll<VscodeButton>("vscode-button").forEach(b=>b.disabled = !initbody.editable);
			}

			for (const scope of ModSettingsScopeNames) {
				const scopenode = document.getElementById(scope)!;
				scopenode.replaceChildren();
				for (const key in settings[scope]) {
					const value = settings[scope][key];
					scopenode.append(settingNode(key, value));
				}
				if (initbody.editable) {
					const addnode = templates.setting_add.content.cloneNode(true) as DocumentFragment;
					addnode.querySelector(".setting-addbtn")!.addEventListener("click", (ev)=>{
						const target = ev.target as HTMLElement;
						const button = target.closest<VscodeButton>("vscode-button")!;
						addSetting(button);
					});
					scopenode.append(addnode);
				}
			}
			break;
	}
});

// Signal to VS Code that the webview is initialized.
postMessage('ready', {});