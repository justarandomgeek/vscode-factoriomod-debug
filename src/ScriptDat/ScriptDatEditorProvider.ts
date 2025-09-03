import * as vscode from "vscode";
import { getNonce } from "../Util/WebviewNonce";
import type { ScriptDatMessages } from "./ScriptDatMessages";
import { SavedLuaValueAsPartial } from "./ScriptDatMessages";

import html from "./ScriptDatWebview.html";
import { ScriptDatDocument } from "./ScriptDatDocument";

export class ScriptDatEditorProvider implements vscode.CustomReadonlyEditorProvider<ScriptDatDocument> {

	constructor(
		private readonly context:vscode.ExtensionContext
	) {
		this.context.subscriptions.push(vscode.window.registerCustomEditorProvider("fmtk.scriptdat", this, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		}));
	}

	private readonly webviews = new Map<string, vscode.WebviewPanel>();

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<ScriptDatDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<ScriptDatDocument> {
		const document:ScriptDatDocument = await ScriptDatDocument.create(uri, openContext.backupId);

		const listeners: vscode.Disposable[] = [];

		listeners.push(document.onDidChange(e=>{
			// Tell VS Code that the document has been edited by the use.
			this._onDidChangeCustomDocument.fire({
				document,
				...e,
			});
		}));

		listeners.push(document.onDidChangeContent(e=>{
			// Update all webviews when the document changes
			const webviewPanel = this.webviews.get(document.uri.toString());
			if (webviewPanel) {
				this.postMessage(webviewPanel, 'init', {
					version: document.version,
					data: document.rootdata,
				});
			}
		}));

		document.onDidDispose(()=>listeners.forEach(l=>l.dispose()));

		return document;
	}
	resolveCustomEditor(document: ScriptDatDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {

		const webview = webviewPanel.webview;
		this.webviews.set(document.uri.toString(), webviewPanel);
		webview.options = {
			enableScripts: true,
		};

		webview.html = html
			.replace(/\$cspSource\$/g, webview.cspSource)
			.replace(/\$nonce\$/g, getNonce())
			.replace(/\$ScriptDatWebview\.css\$/g, webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "/dist/ScriptDatWebview.css")).toString())
			.replace(/\$ScriptDatWebview\.js\$/g, webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "/dist/ScriptDatWebview.js")).toString());

		webviewPanel.webview.onDidReceiveMessage(e=>this.onMessage(document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e=>{
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					version: document.version,
					data: document.rootdata,
				});
			}
		});
	}


	private postMessage<K extends keyof ScriptDatMessages>(panel: vscode.WebviewPanel, type: K, body: ScriptDatMessages[K]): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage<K extends keyof ScriptDatMessages>(document: ScriptDatDocument, message: {type: K; body: ScriptDatMessages[K]}) {
		switch (message.type) {
			case 'fetch':
				const fetchbody = message.body as ScriptDatMessages['fetch'];
				const value = document.find(fetchbody.modname, fetchbody.gcid);
				let values;
				if (fetchbody.index !== undefined && fetchbody.count !== undefined) {
					values = value.values.slice(fetchbody.index, fetchbody.index+fetchbody.count );
				} else {
					values = value.values;
				}

				this.postMessage(this.webviews.get(document.uri.toString())!, 'values', {
					...fetchbody,
					values: values.map(kv=>({
						key: SavedLuaValueAsPartial(kv.key),
						value: SavedLuaValueAsPartial(kv.value),
					})),
				});
				break;
		}
	}
}
