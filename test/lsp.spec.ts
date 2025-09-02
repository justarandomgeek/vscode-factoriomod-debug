import { suite, test, before, after, beforeEach, afterEach } from "node:test";
import * as path from "path";
import * as fsp from "fs/promises";
import type { ChildProcess} from "child_process";
import { fork } from "child_process";
import type { ProtocolConnection, InitializeParams, DidOpenTextDocumentParams } from "vscode-languageserver-protocol";
import { StreamMessageReader, StreamMessageWriter } from "vscode-languageserver-protocol/node.js";
import { createProtocolConnection, ShutdownRequest, ExitNotification, InitializeRequest, InitializedNotification, DidOpenTextDocumentNotification, PublishDiagnosticsNotification } from "vscode-languageserver-protocol";
import type { CodeAction, CodeActionParams, ColorPresentationParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DocumentColorParams, DocumentSymbol, DocumentSymbolParams, ProtocolNotificationType, PublishDiagnosticsParams } from "vscode-languageserver-protocol";
import { CodeActionKind, CodeActionRequest, ColorPresentationRequest, DiagnosticSeverity, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, DocumentColorRequest, DocumentSymbolRequest, SymbolKind } from "vscode-languageserver-protocol";
import { expect } from "chai";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as ChangeLog from "../src/Language/ChangeLog.ts";

function docItem(doc:TextDocument) {
	return { uri: doc.uri, languageId: doc.languageId, version: doc.version, text: doc.getText() };
}

await suite("LSP", async ()=>{
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

	before(async ()=>{
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

	after(async ()=>{
		await clientConnection.sendRequest(ShutdownRequest.type);
		await clientConnection.sendNotification(ExitNotification.type);
		await new Promise<void>((resolve)=>{
			server.once("exit", ()=>{ resolve(); });
		});
		clientConnection.end();
	});

	await suite("Changelog", async ()=>{
		let doc:TextDocument;

		beforeEach(async (t)=>{
			const testfile = path.join(import.meta.dirname, "changelog", `${t.name}.txt`);
			doc = TextDocument.create(`test://${t.name}/changelog.txt`, "factorio-changelog", 1, await fsp.readFile(testfile, "utf8"));
			await clientConnection.sendNotification(DidOpenTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidOpenTextDocumentParams);
		});

		afterEach(async ()=>{
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		await test("../factorio/data/changelog", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics.filter(d=>d.severity===DiagnosticSeverity.Error)).length(0);
		});

		await test("valid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		function singleDiagTest(diagname:string, andFix?:boolean) {
			return async ()=>{
				const diags = await waitForNotification(PublishDiagnosticsNotification.type);
				expect(diags.uri).equals(doc.uri);
				expect(diags.diagnostics).length(1);
				expect(diags.diagnostics[0].code).equals(diagname);

				if (andFix) { await singleCodeActionShouldFix(doc, diags); }
			};
		}

		await test("separator-length", singleDiagTest("separator.length", true));
		await test("separator-eof", singleDiagTest("separator.remove", true));
		await test("version-missing", singleDiagTest("version.insert", true));
		await test("version-duplicate", singleDiagTest("version.duplicate"));
		await test("version-valformat", singleDiagTest("version.value"));
		await test("version-format", singleDiagTest("version.format"));
		await test("version-order", singleDiagTest("version.order"));
		await test("separator-missing", singleDiagTest("separator.insert", true));
		await test("date-duplicate", singleDiagTest("date.remove", true));
		await test("date-placement", singleDiagTest("date.placement"));
		await test("date-format", singleDiagTest("date.format"));
		await test("category-prefix", singleDiagTest("category.prefix", true));
		await test("category-suffix", singleDiagTest("category.suffix", true));
		await test("category-nonstandard", singleDiagTest("category.nonstandard"));
		await test("category-none", singleDiagTest("category.insert", true));
		await test("line-blank", singleDiagTest("entry.empty"));
		await test("line-duplicate", singleDiagTest("entry.duplicate"));
		await test("line-extduplicate", singleDiagTest("entry.duplicate"));
		await test("line-nesting", singleDiagTest("entry.prefix"));
		await test("line-format", singleDiagTest("entry.prefix", true));
		await test("line-extformat", singleDiagTest("entryext.prefix", true));

		await test("symbols", async ()=>{
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

		await test("date-setdate", async ()=>{
			// valid to start...
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);

			const tree = ChangeLog.parse(doc);

			const oldText = doc.getText();
			const newText = TextDocument.applyEdits(doc, [
				ChangeLog.setDate(tree, "1.0.0", "today")!,
				ChangeLog.setDate(tree, "1.0.1", "tomorrow")!,
			]);
			expect(oldText).not.equals(newText);
			expect(oldText).not.contains("today");
			expect(oldText).not.contains("tomorrow");
			expect(oldText).contains("????");
			expect(newText).contains("today");
			expect(newText).contains("tomorrow");
			expect(newText).not.contains("????");
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

	await suite("Locale", async ()=>{
		let doc:TextDocument;

		beforeEach(async (t)=>{
			const testfile = path.join(import.meta.dirname, "locale", `${t.name}.cfg`);
			doc = TextDocument.create(`test://${t.name}/locale/en/test.cfg`, "factorio-locale", 1, await fsp.readFile(testfile, "utf8"));
			await clientConnection.sendNotification(DidOpenTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidOpenTextDocumentParams);
		});

		afterEach(async ()=>{
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		await test("valid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(0);
		});

		await test("section-merge", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.merge");

			await singleCodeActionShouldFix(doc, diags);
		});

		await test("section-rootconflict", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.rootconflict");
		});

		await test("section-emptyname", async ()=>{
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

		await test("section-invalid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("section.invalid");
		});

		await test("key-duplicate", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.duplicate");
		});

		await test("key-empty", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.invalid");
		});

		await test("key-invalid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.invalid");
		});

		await test("key-whitespace-end", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			expect(diags.uri).equals(doc.uri);
			expect(diags.diagnostics).length(1);
			expect(diags.diagnostics[0].code).equals("key.whitespace-end");
		});

		await test("color", async ()=>{
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