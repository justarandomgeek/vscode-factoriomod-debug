import * as vscode from "vscode";
import { ModSettings, ModSettingsData } from "./ModSettings";
import { BufferStream } from "../Util/BufferStream";
import { BigIntReplacer, ModSettingsMessages, ToBigIntValue } from "./ModSettingsMessages";

export class ModSettingsEditorProvider implements vscode.CustomEditorProvider<ModSettingsDocument> {

	constructor(
		private readonly context:vscode.ExtensionContext
	) {
		this.context.subscriptions.push(vscode.window.registerCustomEditorProvider("fmtk.modsettings", this, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: {
				retainContextWhenHidden: true,
			},
		}));
	}

	private readonly webviews = new Map<string, vscode.WebviewPanel>();

	private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<ModSettingsDocument>>();
	public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;


	async saveCustomDocument(document: ModSettingsDocument, cancellation: vscode.CancellationToken) {
		return document.save(cancellation);
	}
	async saveCustomDocumentAs(document: ModSettingsDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken) {
		return document.saveAs(destination, cancellation);
	}
	async revertCustomDocument(document: ModSettingsDocument, cancellation: vscode.CancellationToken) {
		return document.revert(cancellation);
	}
	async backupCustomDocument(document: ModSettingsDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken) {
		return document.backup(context.destination, cancellation);
	}

	async openCustomDocument(uri: vscode.Uri, openContext: vscode.CustomDocumentOpenContext, token: vscode.CancellationToken): Promise<ModSettingsDocument> {
		const document:ModSettingsDocument = await ModSettingsDocument.create(uri, openContext.backupId);

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
					saves_ints: document.saves_ints,
					settings: JSON.stringify(document.settings, BigIntReplacer),
					editable: vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) !== false,
				});
			}
		}));

		document.onDidDispose(()=>listeners.forEach(l=>l.dispose()));

		return document;
	}
	async resolveCustomEditor(document: ModSettingsDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken) {

		const webview = webviewPanel.webview;
		this.webviews.set(document.uri.toString(), webviewPanel);
		webview.options = {
			enableScripts: true,
		};
		//@ts-expect-error
		const html = <string>(await import("./ModSettingsWebview.html")).default;
		webview.html = html
			.replace(/\$cspSource\$/g, webview.cspSource)
			.replace(/\$nonce\$/g, getNonce())
			.replace(/\$ModSettingsWebview\.css\$/g, webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "/dist/ModSettingsWebview.css")).toString())
			.replace(/\$ModSettingsWebview\.js\$/g, webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "/dist/ModSettingsWebview.js")).toString());

		webviewPanel.webview.onDidReceiveMessage(e=>this.onMessage(document, e));

		// Wait for the webview to be properly ready before we init
		webviewPanel.webview.onDidReceiveMessage(e=>{
			if (e.type === 'ready') {
				this.postMessage(webviewPanel, 'init', {
					version: document.version,
					saves_ints: document.saves_ints,
					settings: JSON.stringify(document.settings, BigIntReplacer),
					editable: vscode.workspace.fs.isWritableFileSystem(document.uri.scheme) !== false,
				});
			}
		});
	}


	private postMessage<K extends keyof ModSettingsMessages>(panel: vscode.WebviewPanel, type: K, body: ModSettingsMessages[K]): void {
		panel.webview.postMessage({ type, body });
	}

	private onMessage<K extends keyof ModSettingsMessages>(document: ModSettingsDocument, message: {type: K; body: ModSettingsMessages[K]}) {
		switch (message.type) {
			case 'edit':
			{
				document.edit(message.body as ModSettingsMessages['edit']);
				return;
			}
		}
	}
}

export class ModSettingsDocument implements vscode.CustomDocument {
	public static async create(uri:vscode.Uri, backupId: string | undefined) {
		const fromuri = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const content = await vscode.workspace.fs.readFile(fromuri);
		return new ModSettingsDocument(uri, content);
	}

	private _settings:ModSettings;

	private constructor(
		readonly uri: vscode.Uri,
		_content:Uint8Array,
	) {
		this._settings = new ModSettings(new BufferStream(_content));
	}


	public get version() : string {
		return this._settings.version.format();
	}

	public get saves_ints() {
		return this._settings.version.isBeyond(1, 2);
	}

	public get settings(): Readonly<ModSettingsData> {
		return this._settings.settings;
	}

	async save(cancellation: vscode.CancellationToken) {
		return this.saveAs(this.uri, cancellation);
	}

	async saveAs(destination: vscode.Uri, cancellation: vscode.CancellationToken) {
		return vscode.workspace.fs.writeFile(destination, this._settings.save());
	}

	async revert(cancellation: vscode.CancellationToken) {
		this._settings = new ModSettings(new BufferStream(await vscode.workspace.fs.readFile(this.uri)));
		this._onDidChangeDocument.fire({});
	}

	async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
		await this.saveAs(destination, cancellation);

		return {
			id: destination.toString(),
			delete: async ()=>{
				try {
					await vscode.workspace.fs.delete(destination);
				} catch {
					// noop
				}
			},
		};
	}

	edit(edit:ModSettingsMessages['edit']) {
		if (edit.value.type === "none") {
			this._settings.set(edit.scope, edit.name, undefined);
		} else {
			this._settings.set(edit.scope, edit.name, ToBigIntValue(edit.value));
		}
		this._onDidChange.fire({});
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

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}