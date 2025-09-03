import * as vscode from "vscode";
import { BufferStream } from "../Util/BufferStream";
import { ScriptDat } from "./ScriptDat";
import { type PartialSavedLuaValue, SavedLuaValueAsPartial } from "./ScriptDatMessages";


export class ScriptDatDocument implements vscode.CustomDocument {
	public static async create(uri: vscode.Uri, backupId: string | undefined) {
		const fromuri = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
		const content = await vscode.workspace.fs.readFile(fromuri);
		return new ScriptDatDocument(uri, content);
	}

	private _data: ScriptDat;

	private constructor(
		readonly uri: vscode.Uri,
		_content: Uint8Array
	) {
		this._data = new ScriptDat(new BufferStream(_content));
	}


	public get version(): string {
		return this._data.version.format();
	}

	public get rootdata() {
		const data = {} as { [k: string]: PartialSavedLuaValue };
		for (const key in this._data.data) {
			data[key] = SavedLuaValueAsPartial(this._data.data[key]);
		}
		return data;
	}

	public find(modname: string, id: number) {
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

	private readonly _onDidChange = new vscode.EventEmitter<object>();
	/**
	 * Fired to tell VS Code that an edit has occurred in the document.
	 *
	 * This updates the document's dirty indicator.
	 */
	public readonly onDidChange = this._onDidChange.event;

	private readonly disposables: vscode.Disposable[] = [this._onDidDispose, this._onDidChangeDocument, this._onDidChange];
	dispose(): void {
		this._onDidDispose.fire();
		this.disposables.forEach(d=>d.dispose());
	}

}
