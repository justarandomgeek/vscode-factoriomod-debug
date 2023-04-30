import * as vscode from 'vscode';
import * as keytar from "keytar";

export class Keychain {
	constructor(
		private readonly secrets: vscode.SecretStorage
	) {

	}

	public async MigrateApiKey() {
		if (process.env["FACTORIO_UPLOAD_API_KEY"]) { return; }
		const vskey = await this.secrets.get("factorio-uploadmods");
		const ktkey = await keytar.getPassword("fmtk", "factorio-uploadmods");

		if (vskey) {
			if (!ktkey) {
				await Promise.all([
					keytar.setPassword("fmtk", "factorio-uploadmods", vskey),
					this.secrets.delete("factorio-uploadmods"),
				]);
			} else if (vskey === ktkey) {
				await this.secrets.delete("factorio-uploadmods");
			} else {
				// vskey and ktkey both set and differ
				switch (await vscode.window.showInformationMessage(
					"Factorio Mod Portal API Key is present in both VSCode and standalone FMTK key storage. Keys in VSCode key storage will no longer be used.",
					"Remove VSCode key", "Replace FMTK key with VSCode key"
				)) {
					case "Remove VSCode key":
						await this.secrets.delete("factorio-uploadmods");
						break;
					case "Replace FMTK key with VSCode key":
						await Promise.all([
							keytar.setPassword("fmtk", "factorio-uploadmods", vskey),
							this.secrets.delete("factorio-uploadmods"),
						]);
						break;
					default:
						break;
				}
			}
		}
	}

	public async ReadyAPIKey(setnew?:boolean) {
		if (process.env["FACTORIO_UPLOAD_API_KEY"]) { return true; }
		try {
			let key:string|null|undefined = await keytar.getPassword("fmtk", "factorio-uploadmods");
			if (key) {
				if (setnew) {
					setnew = (await vscode.window.showInformationMessage("Key already present. Replace it?", "Yes", "No")) === "Yes";
				}
				if (!setnew) { return true; }
			}
			key = await vscode.window.showInputBox({prompt: "Mod Portal API Key:", ignoreFocusOut: true, password: true });
			if (key) {
				await keytar.setPassword("fmtk", "factorio-uploadmods", key);
				return true;
			}
		} catch (error) {}
		return false;
	}

	public async ClearApiKey() {
		return keytar.deletePassword("fmtk", "factorio-uploadmods");
	}
}