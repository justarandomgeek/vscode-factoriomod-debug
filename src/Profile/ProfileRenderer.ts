import * as vscode from "vscode";
import { Profile } from "./Profile";

export class ProfileRenderer {
	constructor(
		private readonly context:vscode.ExtensionContext,
	) {

		context.subscriptions.push(vscode.debug.onDidStartDebugSession((e)=>this.onDidStartDebugSession(e), this));
	}

	private onDidStartDebugSession(session:vscode.DebugSession) {
		if (session.type === "factoriomod" && session.configuration.hookMode === "profile") {
			new Profile(session.configuration.profileTree??true, this.context, session);
		}
	}
}