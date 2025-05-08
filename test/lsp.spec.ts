import { setup, teardown, suite, test, suiteSetup, suiteTeardown } from "mocha";
import * as path from "path";
import * as fsp from "fs/promises";
import type { ChildProcess} from "child_process";
import { fork } from "child_process";
import type { ProtocolConnection, InitializeParams, DidOpenTextDocumentParams } from "vscode-languageserver-protocol/node";
import { createProtocolConnection, StreamMessageReader, StreamMessageWriter, ShutdownRequest, ExitNotification, InitializeRequest, InitializedNotification, DidOpenTextDocumentNotification, PublishDiagnosticsNotification } from "vscode-languageserver-protocol/node";
import type { CodeAction, CodeActionParams, ColorPresentationParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DocumentColorParams, DocumentSymbol, DocumentSymbolParams, ProtocolNotificationType, PublishDiagnosticsParams } from "vscode-languageserver-protocol";
import { CodeActionKind, CodeActionRequest, ColorPresentationRequest, DiagnosticSeverity, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, DocumentColorRequest, DocumentSymbolRequest, SymbolKind } from "vscode-languageserver-protocol";
import { expect } from "chai";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as ChangeLog from "../src/Language/ChangeLog";

function docItem(doc:TextDocument) {
	return { uri: doc.uri, languageId: doc.languageId, version: doc.version, text: doc.getText() };
}

suite("LSP", ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const cwd = path.join(import.meta.dirname, "./mod");
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
		await clientConnection.sendNotification(InitializedNotification.type, {});
	});

	suiteTeardown(async ()=>{
		await clientConnection.sendRequest(ShutdownRequest.type);
		await clientConnection.sendNotification(ExitNotification.type);
		await new Promise<void>((resolve)=>{
			server.once("exit", ()=>{ resolve(); });
		});
		clientConnection.end();
	});

	suite("Changelog", ()=>{
		let doc:TextDocument;

		setup(async function() {
			const testfile = path.join(import.meta.dirname, "changelog", `${this.currentTest!.title}.txt`);
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

		test("../factorio/data/changelog", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics.filter(d=>d.severity===DiagnosticSeverity.Error)).length(0);
		});

		test("valid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		function singleDiagTest(diagname:string, andFix?:boolean) {
			return async function() {
				const diags = await waitForNotification(PublishDiagnosticsNotification.type);
				expect(diags.uri).equals(doc.uri);
				expect(diags.diagnostics).length(1);
				expect(diags.diagnostics[0].code).equals(diagname);

				if (andFix) { await singleCodeActionShouldFix(doc, diags); }
			};
		}

		test("separator-length", singleDiagTest("separator.length", true));
		test("separator-eof", singleDiagTest("separator.remove", true));
		test("version-missing", singleDiagTest("version.insert", true));
		test("version-duplicate", singleDiagTest("version.duplicate"));
		test("version-valformat", singleDiagTest("version.value"));
		test("version-format", singleDiagTest("version.format"));
		test("version-order", singleDiagTest("version.order"));
		test("separator-missing", singleDiagTest("separator.insert", true));
		test("date-duplicate", singleDiagTest("date.remove", true));
		test("date-placement", singleDiagTest("date.placement"));
		test("date-format", singleDiagTest("date.format"));
		test("category-prefix", singleDiagTest("category.prefix", true));
		test("category-suffix", singleDiagTest("category.suffix", true));
		test("category-nonstandard", singleDiagTest("category.nonstandard"));
		test("category-none", singleDiagTest("category.insert", true));
		test("line-blank", singleDiagTest("entry.empty"));
		test("line-duplicate", singleDiagTest("entry.duplicate"));
		test("line-extduplicate", singleDiagTest("entry.duplicate"));
		test("line-nesting", singleDiagTest("entry.prefix"));
		test("line-format", singleDiagTest("entry.prefix", true));
		test("line-extformat", singleDiagTest("entryext.prefix", true));

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

		test("date-setdate", async function() {
			// valid to start...
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);

			const tree = ChangeLog.parse(doc);
			const edit = ChangeLog.setDate(tree, "1.0.0", "today")!;

			const oldText = doc.getText();
			const newText = TextDocument.applyEdits(doc, [edit]);
			expect(oldText).not.equals(newText);
			expect(oldText).not.contains("today");
			expect(newText).contains("today");
			TextDocument.update(doc, [{text: newText}], doc.version+1);
			await clientConnection.sendNotification(DidChangeTextDocumentNotification.type, {
				contentChanges: [{text: newText}],
				textDocument: { uri: doc.uri, version: doc.version },
			} as DidChangeTextDocumentParams);

			const afterdiags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(afterdiags.uri).equals(doc.uri);
			expect(afterdiags.diagnostics).length(0);
		});

	});

	suite("Locale", ()=>{
		let doc:TextDocument;

		setup(async function() {
			const testfile = path.join(import.meta.dirname, "locale", `${this.currentTest!.title}.cfg`);
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

		test("section-emptyname", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.invalid");

			const symbols = <DocumentSymbol[]> await clientConnection.sendRequest(DocumentSymbolRequest.type, { textDocument: docItem(doc) } as DocumentSymbolParams);
			expect(symbols).length(1);
			expect(symbols[0]).includes({
				detail: '',
				kind: SymbolKind.Namespace,
			});
			expect(symbols[0].name);
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

		test("key-empty", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.invalid");
		});

		test("key-invalid", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.invalid");
		});

		test("key-whitespace-end", async function() {
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.whitespace-end");
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