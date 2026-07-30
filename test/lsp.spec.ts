import { suite, test, before, after, beforeEach, afterEach } from "node:test";
import assert from 'node:assert/strict';
import * as path from "path";
import * as fsp from "fs/promises";
import type { ChildProcess } from "child_process";
import { fork } from "child_process";
import type { ProtocolConnection, InitializeParams } from "vscode-languageserver-protocol";
import { StreamMessageReader, StreamMessageWriter } from "vscode-languageserver-protocol/node";
import { createProtocolConnection, ShutdownRequest, ExitNotification, InitializeRequest, InitializedNotification, DidOpenTextDocumentNotification, PublishDiagnosticsNotification } from "vscode-languageserver-protocol";
import type { CodeAction, CodeActionParams, ColorPresentationParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams, DocumentColorParams, DocumentSymbol, DocumentSymbolParams, ProtocolNotificationType, PublishDiagnosticsParams } from "vscode-languageserver-protocol";
import { CodeActionKind, CodeActionRequest, ColorPresentationRequest, DiagnosticSeverity, DidChangeTextDocumentNotification, DidCloseTextDocumentNotification, DocumentColorRequest, DocumentSymbolRequest, SymbolKind } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as ChangeLog from "../src/Language/ChangeLog.ts";

function docItem(doc:TextDocument) {
	return { uri: doc.uri, languageId: doc.languageId, version: doc.version, text: doc.getText() };
}

await suite("LSP", { concurrency: false }, async ()=>{
	const fmtk = path.join(import.meta.dirname, '../dist/fmtk-cli.js');
	const cwd = path.join(import.meta.dirname, "./");
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
		assert.equal(actions.length, 1);
		assert.equal(actions[0].kind, CodeActionKind.QuickFix + "." + diags.diagnostics[0].code);

		const edits = actions[0].edit!.changes![doc.uri];
		const oldText = doc.getText();
		const newText = TextDocument.applyEdits(doc, edits);
		assert.notEqual(oldText, newText);
		TextDocument.update(doc, [{text: newText}], doc.version+1);
		await clientConnection.sendNotification(DidChangeTextDocumentNotification.type, {
			contentChanges: [{text: newText}],
			textDocument: { uri: doc.uri, version: doc.version },
		} as DidChangeTextDocumentParams);

		const afterdiags = await waitForNotification(PublishDiagnosticsNotification.type);
		assert.equal(afterdiags.uri, doc.uri);
		assert.equal(afterdiags.diagnostics.length, 0);
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
				{ textDocument: docItem(doc) });
		});

		afterEach(async ()=>{
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);
		});

		await test.skip("../factorio/data/changelog", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.filter(d=>d.severity===DiagnosticSeverity.Error).length, 0);
		});

		await test("valid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);
		});

		function singleDiagTest(diagname:string, andFix?:boolean) {
			return async ()=>{
				const diags = await waitForNotification(PublishDiagnosticsNotification.type);
				assert.equal(diags.uri, doc.uri);
				assert.equal(diags.diagnostics.length, 1);
				assert.equal(diags.diagnostics[0].code, diagname);

				if (andFix) { await singleCodeActionShouldFix(doc, diags); }
			};
		}

		await test("separator-length", singleDiagTest("separator.length", true));
		await test("separator-eof", singleDiagTest("separator.extra", true));
		await test("version-missing", singleDiagTest("version.missing", true));
		await test("version-duplicate", singleDiagTest("version.duplicate"));
		await test("version-valformat", singleDiagTest("version.value"));
		await test("version-format", singleDiagTest("version.format"));
		await test("version-order", singleDiagTest("version.order"));
		await test("separator-missing", singleDiagTest("separator.missing", true));
		await test("date-duplicate", singleDiagTest("date.duplicate", true));
		await test("date-placement", singleDiagTest("date.placement"));
		await test("date-format", singleDiagTest("date.format"));
		await test("category-prefix", singleDiagTest("category.prefix", true));
		await test("category-suffix", singleDiagTest("category.suffix", true));
		await test("category-nonstandard", singleDiagTest("category.nonstandard"));
		await test("category-none", singleDiagTest("category.missing", true));
		await test("line-blank", singleDiagTest("entry.empty"));
		await test("line-duplicate", singleDiagTest("entry.duplicate"));
		await test("line-extduplicate", singleDiagTest("entry.duplicate"));
		await test("line-nesting", singleDiagTest("entry.prefix"));
		await test("line-format", singleDiagTest("entry.prefix", true));
		await test("line-extformat", singleDiagTest("entryext.prefix", true));


		function fixAllTest() {
			return async (t:test.TestContext)=>{
				const diags = await waitForNotification(PublishDiagnosticsNotification.type);
				assert.equal(diags.uri, doc.uri);
				assert.notEqual(diags.diagnostics.length, 0);

				const actions = await clientConnection.sendRequest(CodeActionRequest.type, {
					textDocument: docItem(doc),
					range: diags.diagnostics[0].range,
					context: {
						diagnostics: diags.diagnostics,
					},
				} as CodeActionParams) as CodeAction[];

				const fixall = actions.find(a=>a.kind === CodeActionKind.QuickFix + ".all");
				assert.ok(fixall);

				const edits = fixall.edit!.changes![doc.uri];
				const oldText = doc.getText();
				const newText = TextDocument.applyEdits(doc, edits);
				assert.notEqual(oldText, newText);
				TextDocument.update(doc, [{text: newText}], doc.version+1);
				await clientConnection.sendNotification(DidChangeTextDocumentNotification.type, {
					contentChanges: [{text: newText}],
					textDocument: { uri: doc.uri, version: doc.version },
				} as DidChangeTextDocumentParams);

				const afterdiags = await waitForNotification(PublishDiagnosticsNotification.type);
				assert.equal(afterdiags.uri, doc.uri);
				assert.equal(afterdiags.diagnostics.length, 0);

				const expectfile = path.join(import.meta.dirname, "changelog", `${t.name}.expect.txt`);
				assert.equal(newText, await fsp.readFile(expectfile, "utf8"));
			};
		}

		await test("line-nesting-all", fixAllTest());

		await test("symbols", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);

			const symbols = <DocumentSymbol[]> await clientConnection.sendRequest(DocumentSymbolRequest.type, { textDocument: docItem(doc) } as DocumentSymbolParams);
			assert.equal(symbols.length, 4);
			for (const symbol of symbols) {
				assert.equal(symbol.detail, '');
				assert.equal(symbol.kind, SymbolKind.Namespace);
				assert(['0.0.1', '0.0.2', '0.0.3', '0.0.4'].includes(symbol.name));
			}
		});

		await test("date-setdate", async ()=>{
			// valid to start...
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);

			const tree = ChangeLog.parse(doc);

			const oldText = doc.getText();
			const newText = TextDocument.applyEdits(doc, [
				ChangeLog.setDate(tree, "1.0.0", "today")!,
				ChangeLog.setDate(tree, "1.0.1", "tomorrow")!,
			]);
			assert.notEqual(oldText, newText);
			assert(!oldText.includes("today"));
			assert(!oldText.includes("tomorrow"));
			assert(oldText.includes("????"));
			assert(newText.includes("today"));
			assert(newText.includes("tomorrow"));
			assert(!newText.includes("????"));
			TextDocument.update(doc, [{text: newText}], doc.version+1);
			await clientConnection.sendNotification(DidChangeTextDocumentNotification.type, {
				contentChanges: [{text: newText}],
				textDocument: { uri: doc.uri, version: doc.version },
			} as DidChangeTextDocumentParams);

			const afterdiags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(afterdiags.uri, doc.uri);
			assert.equal(afterdiags.diagnostics.length, 0);
		});

	});

	await suite("Locale", async ()=>{
		let doc:TextDocument;

		beforeEach(async (t)=>{
			const testfile = path.join(import.meta.dirname, "locale", `${t.name}.cfg`);
			doc = TextDocument.create(`test://${t.name}/locale/en/test.cfg`, "factorio-locale", 1, await fsp.readFile(testfile, "utf8"));
			await clientConnection.sendNotification(DidOpenTextDocumentNotification.type,
				{ textDocument: docItem(doc) });
		});

		afterEach(async ()=>{
			await clientConnection.sendNotification(DidCloseTextDocumentNotification.type,
				{ textDocument: docItem(doc) } as DidCloseTextDocumentParams);
			// and catch the diag clear for that doc
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);
		});

		await test("valid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);
		});

		await test("section-merge", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "section.duplicate");

			await singleCodeActionShouldFix(doc, diags);
		});

		await test("section-rootconflict", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "section.rootconflict");
		});

		await test("section-invalid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "error.unknown");
		});

		await test("key-duplicate", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "key.duplicate");
		});

		await test("key-empty", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "key.empty");
		});

		await test("key-invalid", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "error.unknown");
		});

		await test("key-whitespace-end", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 1);
			assert.equal(diags.diagnostics[0].code, "key.whitespace-end");
		});

		await test("color", async ()=>{
			const diags = await waitForNotification(PublishDiagnosticsNotification.type);
			assert.equal(diags.uri, doc.uri);
			assert.equal(diags.diagnostics.length, 0);

			const colors = await clientConnection.sendRequest(DocumentColorRequest.type, {
				textDocument: {uri: doc.uri},
			} as DocumentColorParams);
			assert.equal(colors.length, 1);

			const pres = await clientConnection.sendRequest(ColorPresentationRequest.type, {
				textDocument: {uri: doc.uri},
				...colors[0],
			} as ColorPresentationParams);
			assert.equal(pres.length, 4);
			assert.deepEqual(pres.map(p=>p.label), ['red', '#ff2a23', '255, 42, 35', '1, 0.166, 0.141']);
		});

	});
});