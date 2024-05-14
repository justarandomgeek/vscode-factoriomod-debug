import * as vscode from 'vscode';

export class Keychain {
	constructor(
		private readonly secrets: vscode.SecretStorage
	) {

	}


	public async ReadyAPIKey(setnew?:boolean) {
		if (process.env["FACTORIO_UPLOAD_API_KEY"]) { return {from: "env"}; }
		try {
			let key = await this.secrets.get("factorio-uploadmods");
			if (key) {
				if (setnew) {
					setnew = (await vscode.window.showInformationMessage("Key already present. Replace it?", "Yes", "No")) === "Yes";
				}
				if (!setnew) { return {from: "secrets", key }; }
			}
			key = await vscode.window.showInputBox({prompt: "Mod Portal API Key:", ignoreFocusOut: true, password: true });
			if (key) {
				key = key.trim();
				await this.secrets.store("factorio-uploadmods", key);
				return {from: "new", key };;
			}
		} catch (error) {}
		return false;
	}

	public async ClearApiKey() {
		return this.secrets.delete("factorio-uploadmods");
	}
}