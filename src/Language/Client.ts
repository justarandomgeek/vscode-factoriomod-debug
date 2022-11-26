import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {

	const serverModule = context.asAbsolutePath(
		path.join('dist', 'fmtk.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=34199'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
			args: [ "lsp" ],
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			args: [ "lsp" ],
			options: debugOptions,
		},
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ language: 'factorio-locale' },
			{ language: 'factorio-changelog' },
			{ language: 'lua' },
		],
		synchronize: {
			fileEvents: [
				workspace.createFileSystemWatcher('**/locale/*/*.cfg'),
			],
		},
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'factorioLanguageServer',
		'Factorio Language Server',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}