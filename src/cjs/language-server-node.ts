export {
	Diagnostic,
	DiagnosticSeverity,
	DocumentSymbol,
	SymbolKind,
	CodeActionContext,
	CodeAction,
	CodeActionKind,
	Range,
	Color, ColorInformation, ColorPresentation,
	LocationLink,
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