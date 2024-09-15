import * as vscode from "vscode";
import { getNonce } from "../Util/WebviewNonce";
import { BufferStream, ScriptDat } from "../fmtk";
import { PartialSavedLuaValue, SavedLuaValueAsPartial, ScriptDatMessages } from "./ScriptDatMessages";

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
	async resolveCustomEditor(document: ScriptDatDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {

		const webview = webviewPanel.webview;
		this.webviews.set(document.uri.toString(), webviewPanel);
		webview.options = {
			enableScripts: true,
		};
		//@ts-expect-error import
		const html = <string>(await import("./ScriptDatWebview.html")).default;
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
				this.postMessage(this.webviews.get(document.uri.toString())!, 'values', {
					...fetchbody,
					values: value.values.map(kv=>({
						key: SavedLuaValueAsPartial(kv.key),
						value: SavedLuaValueAsPartial(kv.value),
					})),
				});
				break;
		}
	}
}

export class ScriptDatDocument implements vscode.CustomDocument {
	public static async create(uri:vscode.Uri, backupId: string | undefined) {
		const fromuri = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const content = await vscode.workspace.fs.readFile(fromuri);
		return new ScriptDatDocument(uri, content);
	}

	private _data:ScriptDat;

	private constructor(
		readonly uri: vscode.Uri,
		_content:Uint8Array,
	) {
		this._data = new ScriptDat(new BufferStream(_content));
	}


	public get version() : string {
		return this._data.version.format();
	}

	public get rootdata() {
		const data = {} as {[k:string]:PartialSavedLuaValue};
		for (const key in this._data.data) {
			data[key] = SavedLuaValueAsPartial(this._data.data[key]);
		}
		return data;
	}

	public find(modname:string, id:number) {
		return this._data.find(modname, id);
	}

	private readonly _onDidDispose = new vscode.EventEmitter<void>();
	/**
	 * Fired when the document is disposed of.
	 */
	public readonly onDidDispose = this._onDidDispose.event;

	private readonly _onDidChangeDocument = new vscode.EventEmitter<{
		readonly content?: Uint8Array
	}>();
	/**
	 * Fired to notify webviews that the document has changed.
	 */
	public readonly onDidChangeContent = this._onDidChangeDocument.event;

	private readonly _onDidChange = new vscode.EventEmitter<{}>();
	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	private readonly disposables:vscode.Disposable[] = [this._onDidDispose, this._onDidChangeDocument, this._onDidChange];
	dispose(): void {
		this._onDidDispose.fire();
		this.disposables.forEach(d=>d.dispose());
	}

}
