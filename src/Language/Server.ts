import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	InitializeResult,
} from 'vscode-languageserver/node';

import {
	TextDocument,
} from 'vscode-languageserver-textdocument';

import * as ChangeLog from "./ChangeLog";
import * as Locale from "./Locale";

export function runLanguageServer() {

	// Create a connection for the server, using Node's IPC as a transport.
	// Also include all preview / proposed LSP features.
	const connection = createConnection(ProposedFeatures.all);

	// Create a simple text document manager.
	const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

	let hasWorkspaceFolderCapability = false;
	let hasDiagnosticRelatedInformationCapability = false;

	connection.onInitialize((params: InitializeParams)=>{
		const capabilities = params.capabilities;

		hasWorkspaceFolderCapability = !!(
			capabilities.workspace && !!capabilities.workspace.workspaceFolders
		);
		hasDiagnosticRelatedInformationCapability = !!(
			capabilities.textDocument &&
			capabilities.textDocument.publishDiagnostics &&
			capabilities.textDocument.publishDiagnostics.relatedInformation
		);

		const result: InitializeResult = {
			capabilities: {
				textDocumentSync: TextDocumentSyncKind.Incremental,
				documentSymbolProvider: true,
				codeActionProvider: true,
				colorProvider: true,
			},
		};
		if (hasWorkspaceFolderCapability) {
			result.capabilities.workspace = {
				workspaceFolders: {
					supported: true,
				},
			};
		}
		return result;
	});

	connection.onInitialized(()=>{
		if (hasWorkspaceFolderCapability) {
			connection.workspace.onDidChangeWorkspaceFolders(_event=>{
				connection.console.log('Workspace folder change event received.');
			});
		}
	});

	documents.onDidClose(e=>{
		connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
	});

	// The content of a text document has changed. This event is emitted
	// when the text document first opened or when its content has changed.
	documents.onDidChangeContent(change=>{
		validateTextDocument(change.document);
	});

	async function validateTextDocument(textDocument: TextDocument): Promise<void> {
		switch (textDocument.languageId) {
			case "factorio-locale":
				connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: await Locale.validateTextDocument(textDocument) });
				break;
			case "factorio-changelog":
				connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: await ChangeLog.validateTextDocument(textDocument) });
				break;

			default:
				break;
		}
	}

	connection.onDocumentSymbol((request)=>{
		const document = documents.get(request.textDocument.uri);
		if (document) {
			switch (document.languageId) {
				case "factorio-locale":
					return Locale.onDocumentSymbol(document);
				case "factorio-changelog":
					return ChangeLog.onDocumentSymbol(document);
			}
		}
		return null;
	});

	connection.onCodeAction((request)=>{
		const document = documents.get(request.textDocument.uri);
		if (document) {
			switch (document.languageId) {
				case "factorio-locale":
					return Locale.onCodeAction(document, request.range, request.context);
				case "factorio-changelog":
					return ChangeLog.onCodeAction(document, request.range, request.context);
			}
		}
		return null;
	});

	connection.onDocumentColor((request)=>{
		const document = documents.get(request.textDocument.uri);
		if (document) {
			switch (document.languageId) {
				case "factorio-locale":
					return Locale.onDocumentColor(document);
				case "factorio-changelog":
					return null;
			}
		}
		return null;
	});

	connection.onColorPresentation((request)=>{
		const document = documents.get(request.textDocument.uri);
		if (document) {
			switch (document.languageId) {
				case "factorio-locale":
					return Locale.onColorPresentation(request.color, request.range);
				case "factorio-changelog":
					return null;
			}
		}
		return null;
	});

	connection.onDidChangeWatchedFiles(_change=>{
		// Monitored files have change in VSCode
		connection.console.log('We received an file change event');
	});


	// Make the text document manager listen on the connection
	// for open, change and close text document events
	documents.listen(connection);

	// Listen on the connection
	connection.listen();
}