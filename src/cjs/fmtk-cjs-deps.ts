export * as debugadapter from "@vscode/debugadapter"
export * as commander from "commander"

export { TextDocument } from "vscode-languageserver-textdocument";
export type { DocumentUri } from "vscode-languageserver-textdocument";

export {
	CodeAction, CodeActionContext, CodeActionKind, Diagnostic,
	DiagnosticSeverity, DocumentSymbol, SymbolKind, Range,
	Color, ColorInformation, ColorPresentation, LocationLink,
	CompletionItem,
	CompletionItemKind,
	createConnection,
	TextDocuments,
	ProposedFeatures,
	TextDocumentSyncKind,
	FileChangeType,
} from 'vscode-languageserver/node';

export type {
	CompletionParams,
	DefinitionParams,
	InitializeParams,
	InitializeResult,
} from 'vscode-languageserver/node';

export {
	LanguageClient,
	TransportKind,
} from 'vscode-languageclient/node';

export type {
	LanguageClientOptions,
	ServerOptions,
} from 'vscode-languageclient/node';

import treekill from 'tree-kill';
export { treekill }