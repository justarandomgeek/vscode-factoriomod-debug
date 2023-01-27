import { setup, teardown, suite, test, suiteSetup, suiteTeardown } from "mocha";
import * as path from "path";
import * as fsp from "fs/promises";
import { ChildProcess, fork } from "child_process";
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter, ProtocolConnection, ShutdownRequest, ExitNotification, InitializeRequest, InitializeParams, InitializedNotification, DidOpenTextDocumentNotification, DidOpenTextDocumentParams, PublishDiagnosticsNotification } from "vscode-languageserver-protocol/node";
import { CodeAction, CodeActionKind, CodeActionParams, CodeActionRequest, ColorPresentationParams, ColorPresentationRequest, DidChangeTextDocumentNotification, DidChangeTextDocumentParams, DidCloseTextDocumentNotification, DidCloseTextDocumentParams, DocumentColorParams, DocumentColorRequest, DocumentSymbol, DocumentSymbolParams, DocumentSymbolRequest, ProtocolNotificationType, PublishDiagnosticsParams, SymbolKind } from "vscode-languageserver-protocol";
import { expect } from "chai";
import { TextDocument } from "vscode-languageserver-textdocument";


function docItem(doc:TextDocument) {
	return { uri: doc.uri, languageId: doc.languageId, version: doc.version, text: doc.getText() };
}

suite("LSP", ()=>{
	const fmtk = path.join(__dirname, '../dist/fmtk.js');
	const cwd = path.join(__dirname, "./mod");
	let server:ChildProcess;
	let clientConnection:ProtocolConnection;

	async function waitForNotification<P, RO>(type: ProtocolNotificationType<P, RO>) {
		return new Promise<P>((resolve)=>{
			const notif = clientConnection.onNotification(type, (params)=>{
				notif.dispose();
				resolve(params);
			});
		});
	}

	async function singleCodeActionShouldFix(doc:TextDocument, diags:PublishDiagnosticsParams) {
		const actions = await clientConnection.sendRequest(CodeActionRequest.type, {
			textDocument: docItem(doc),
			range: diags.diagnostics[0].range,
			context: {
				diagnostics: diags.diagnostics,
			},
		} as CodeActionParams) as CodeAction[];
		expect(actions).length(1);
		expect(actions[0].kind).equals(CodeActionKind.QuickFix + "." + diags.diagnostics[0].code);

		const edits = actions[0].edit!.changes![doc.uri];
		const oldText = doc.getText();
		const newText = TextDocument.applyEdits(doc, edits);
		expect(oldText).not.equals(newText);
		TextDocument.update(doc, [{text: newText}], doc.version+1);
		await clientConnection.sendNotification(DidChangeTextDocumentNotification.type, {
			contentChanges: [{text: newText}],
			textDocument: { uri: doc.uri, version: doc.version },
		} as DidChangeTextDocumentParams);

		const afterdiags = await waitForNotification(PublishDiagnosticsNotification.type);
		expect(afterdiags.uri).equals(doc.uri);
		expect(afterdiags.diagnostics).length(0);
	}

	suiteSetup(async ()=>{
		server = fork(fmtk, ["lsp", "--stdio"], {cwd: cwd, stdio: "pipe"});
		clientConnection = createProtocolConnection(
			new StreamMessageReader(server.stdout!),
			new StreamMessageWriter(server.stdin!));
		clientConnection.listen();
		await clientConnection.sendRequest(InitializeRequest.type, {
			processId: process.pid,
			capabilities: {
				textDocument: {
					publishDiagnostics: {
						relatedInformation: true,
					},
				},
			},
		} as InitializeParams);
		clientConnection.sendNotification(InitializedNotification.type, {});
	});

	suiteTeardown(async ()=>{
		await new Promise<void>(async (resolve, reject)=>{
			await clientConnection.sendRequest(ShutdownRequest.type);
			server.once("exit", (code, signal)=>{
				if (code===0) {
					resolve();
				} else {
					reject();
				}
			});
			clientConnection.sendNotification(ExitNotification.type);
		});
		clientConnection.end();
	});

	suite("Changelog", ()=>{
		let doc:TextDocument;

		setup(async function() {
			const testfile = path.join(__dirname, "changelog", `${this.currentTest!.title}.txt`);
			doc = TextDocument.create(`test://${this.currentTest!.title}/changelog.txt`, "factorio-changelog", 1, await fsp.readFile(testfile, "utf8"));
			await clientConnection.sendNotification(DidOpenTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidOpenTextDocumentParams);
		});

		teardown(async function() {
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		test("valid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		test("separator-length", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("separator.fixlength");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("separator-eof", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("separator.remove");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("version-missing", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("version.insert");


			await singleCodeActionShouldFix(doc, diags);
		});

		test("version-format", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("version.format");
		});

		test("separator-missing", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("separator.insert");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("date-duplicate", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("date.duplicate");
		});

		test("date-placement", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("date.placement");
		});

		test("category-end", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("category.fixend");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("category-nonstandard", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("category.nonstandard");
		});

		test("category-none", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("category.insert");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("line-format", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("other.unknown");
		});

		test("line-noblock", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("other.noblock");
		});

		test("symbols", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);

			const symbols = <DocumentSymbol[]> await clientConnection.sendRequest(DocumentSymbolRequest.type, { textDocument: docItem(doc) } as DocumentSymbolParams);
			expect(symbols).length(4);
			for (const symbol of symbols) {
				expect(symbol).includes({
					detail: '',
					kind: SymbolKind.Namespace,
				});
				expect(symbol.name).oneOf(['0.0.1', '0.0.2', '0.0.3', '0.0.4']);
			}
		});

	});

	suite("Locale", ()=>{
		let doc:TextDocument;

		setup(async function() {
			const testfile = path.join(__dirname, "locale", `${this.currentTest!.title}.cfg`);
			doc = TextDocument.create(`test://${this.currentTest!.title}/locale/en/test.cfg`, "factorio-locale", 1, await fsp.readFile(testfile, "utf8"));
			await clientConnection.sendNotification(DidOpenTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidOpenTextDocumentParams);
		});

		teardown(async function() {
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		test("valid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		test("section-merge", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.merge");

			await singleCodeActionShouldFix(doc, diags);
		});

		test("section-rootconflict", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.rootconflict");
		});

		test("section-invalid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.invalid");
		});

		test("key-duplicate", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.duplicate");
		});

		test("key-invalid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.invalid");
		});

		test("color", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);

			const colors = await clientConnection.sendRequest(DocumentColorRequest.type, {
				textDocument: {uri: doc.uri},
			} as DocumentColorParams);
			expect(colors).length(1);

			const pres = await clientConnection.sendRequest(ColorPresentationRequest.type, {
				textDocument: {uri: doc.uri},
				...colors[0],
			} as ColorPresentationParams);
			expect(pres).length(4);
			expect(pres.map(p=>p.label)).contains.members(['red', '#ff2a23', '255, 42, 35', '1, 0.166, 0.141']);
		});

	});
});