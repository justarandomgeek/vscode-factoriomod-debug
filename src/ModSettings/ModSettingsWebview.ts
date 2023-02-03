import "./ModSettingsWebview.css";

import type {} from "vscode-webview";
import type { ModSettingsData, ModSettingsScopeName, ModSettingsValue } from "../ModSettings/ModSettings";
import { BigIntReviver, FromBigIntValue, ModSettingsMessages } from "./ModSettingsMessages";

import { provideVSCodeDesignSystem, vsCodeButton, vsCodeCheckbox, vsCodeTextField, TextField, Checkbox, Button, vsCodeDropdown, vsCodeOption, Dropdown, Option, vsCodePanelTab, vsCodePanelView, vsCodePanels } from "@vscode/webview-ui-toolkit";
provideVSCodeDesignSystem().register(vsCodeButton(), vsCodePanelTab(), vsCodePanelView(), vsCodePanels(), vsCodeDropdown(), vsCodeOption(), vsCodeCheckbox(), vsCodeTextField());

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
	setting_add: document.getElementById("setting-add")! as HTMLTemplateElement,
};

window.addEventListener('change', (e)=>{
	const target = e.target as HTMLElement;
	if (target.classList.contains("setting-value")) {
		const scope = target.closest("tbody")!.id as ModSettingsScopeName;
		const key = target.closest("tr")!.id;

		switch (target.localName) {
			case "vscode-text-field":
			{
				const value = settings[scope][key];
				switch (value.type) {
					case "int":
						try {
							value.value = BigInt.asIntN(64, BigInt((target as TextField).value));
						} catch (error) {
							(target as TextField).value = value.value.toString();
							return;
						}
						break;
					case "number":
						value.value = Number((target as TextField).value);
						(target as TextField).value = value.value.toString();
						break;
					case "string":
						value.value = (target as TextField).value;
						break;
				}
				postMessage("edit",  {scope: scope, name: key, value: FromBigIntValue(value)});
				break;
			}
			case "vscode-checkbox":
			{
				const value = settings[scope][key];
				value.value = (target as Checkbox).checked;
				postMessage("edit", {scope: scope, name: key, value: value as ModSettingsValue<never>});
				break;
			}
		}
	}
});

window.addEventListener('click', e=>{
	const target = e.target as HTMLElement;
	const button = target.closest<Button>("vscode-button");
	if (button) {
		const scopebody = button.closest("tbody")!;
		const scope = scopebody.id as ModSettingsScopeName;
		if (button.classList.contains("setting-addbtn")) {
			const row = button.closest("tr")!;
			const namefield = row.querySelector(".setting-add-name") as TextField;
			if (!namefield.value) { return; }
			if (document.getElementById(namefield.value)) { return; }
			const typefield = row.querySelector(".setting-add-type") as Dropdown;
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
			}
			settings[scope][namefield.value] = value;
			row.before(settingNode(namefield.value, value));
			postMessage("edit",  {scope: scope, name: namefield.value, value: FromBigIntValue(value) });
			namefield.value = "";
		} else if (button.classList.contains("setting-delete")) {
			const row = button.closest("tr")!;
			const key = row.id;
			row.remove();
			delete settings[scope][key];
			postMessage("edit",  {scope: scope, name: key, value: { type: "none" }});
		}
	}
});

function settingNode(key:string, value:ModSettingsValue):DocumentFragment {
	let node:DocumentFragment;
	switch (value.type) {
		case "bool":
		{
			node = templates.setting_bool.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("tr")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as Checkbox;

			row.id = key;
			header.append(key);
			field.checked = value.value;
			break;
		}
		case "int":
		case "number":
		{
			node = templates.setting_number.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("tr")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as TextField;

			row.id = key;
			header.append(key);
			field.value = value.value.toString();
			break;
		}
		case "string":
		{
			node = templates.setting_string.content.cloneNode(true) as DocumentFragment;
			const row = node.querySelector("tr")!;
			const header = node.querySelector(".setting-name") as HTMLTableCellElement;
			const field = node.querySelector(".setting-value") as TextField;

			row.id = key;
			header.append(key);
			field.value = value.value;
			break;
		}
	}
	return node;
}

window.addEventListener('message', async <K extends keyof ModSettingsMessages>(e:MessageEvent<ModSettingsMessageEventData<K>>)=>{

	const { type, body } = e.data;
	switch (type) {
		case 'init':
			const initbody = body as ModSettingsMessages['init'];
			settings = JSON.parse(initbody.settings, BigIntReviver);
			elements.version.innerText = initbody.version;

			const typesel = templates.setting_add.content.querySelector(".setting-add-type") as Dropdown;
			(typesel.children[3] as Option).hidden = !initbody.saves_ints;

			for (const templatename in templates) {
				const template = templates[templatename as keyof typeof templates];
				template.content.querySelectorAll<TextField>("vscode-text-field").forEach(b=>b.disabled = initbody.editable);
				template.content.querySelectorAll<Checkbox>("vscode-checkbox").forEach(b=>b.disabled = initbody.editable);
				template.content.querySelectorAll<Dropdown>("vscode-dropdown").forEach(b=>b.disabled = initbody.editable);
				template.content.querySelectorAll<Button>("vscode-button").forEach(b=>b.disabled = initbody.editable);
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
					scopenode.append(addnode);
				}
			}
			break;
	}
});

// Signal to VS Code that the webview is initialized.
postMessage('ready', {});