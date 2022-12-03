import * as vscode from 'vscode';

export class Keychain {
	constructor(
		private readonly secrets: vscode.SecretStorage
	) {

	}

	public async GetAPIKey() {
		let key = await this.secrets.get("factorio-uploadmods");
		if (key) { return key; }
		const config = vscode.workspace.getConfiguration();
		key = await vscode.window.showInputBox({prompt: "Mod Portal API Key:", ignoreFocusOut: true, password: true });
		if (key && config.get("factorio.portal.saveKey", true) &&
			"Yes" === await vscode.window.showInformationMessage("Save this key for future use?", "Yes", "No")) {
			await this.SetApiKey(key);
		}
		return key;
	}

	public async SetApiKey(key:string) {
		return this.secrets.store("factorio-uploadmods", key);
	}

	public async ClearApiKey() {
		return this.secrets.delete("factorio-uploadmods");
	}
}