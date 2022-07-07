import * as vscode from "vscode";
import { Profile } from "./Profile";

export class ProfileRenderer {
	constructor(
		private readonly context:vscode.ExtensionContext,
		) {

	context.subscriptions.push(vscode.debug.onDidStartDebugSession(this.onDidStartDebugSession,this));
	}

	private async onDidStartDebugSession(session:vscode.DebugSession) {
		if (session.type === "factoriomod" && session.configuration.hookMode === "profile") {
			new Profile(session.configuration.profileTree??true,this.context,session);
		}
	}
}