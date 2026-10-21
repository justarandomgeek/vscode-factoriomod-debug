import { test } from "node:test";
import assert from "node:assert/strict";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ChangeLogLanguageService } from "../src/Language/ChangeLog.ts";

const separator = "-".repeat(99);
const header = `${separator}\nVersion: 1.0.0\nDate: 2026-10-21\n  Bugfixes:\n`;

function duplicates(body:string) {
	const service = new ChangeLogLanguageService();
	const uri = "file:///mod/changelog.txt";
	service.loadDocument(TextDocument.create(uri, "factorio-changelog", 1, header + body));
	return service.diagnose(uri).filter(diagnostic=>diagnostic.code === "entry.duplicate");
}

await test("different entries may repeat a continuation credit", ()=>{
	assert.deepEqual(duplicates("    - Fix translated messages.\n      Reported by Alice.\n    - Fix refueling.\n      Reported by Alice.\n"), []);
});

await test("matching first lines with different continuations are distinct entries", ()=>{
	assert.deepEqual(duplicates("    - Fix a problem.\n      In the depot.\n    - Fix a problem.\n      At the provider.\n"), []);
});

await test("repeated continuation lines within an entry are not duplicate entries", ()=>{
	assert.deepEqual(duplicates("    - Explain a sequence.\n      Wait.\n      Change the signal.\n      Wait.\n"), []);
});

await test("identical complete multiline entries report their first lines", ()=>{
	const result = duplicates("    - Fix a problem.\n      Reported by Alice.\n    - Fix a problem.\n      Reported by Alice.\n");
	assert.equal(result.length, 1);
	assert.equal(result[0].range.start.line, 6);
	assert.equal(result[0].relatedInformation?.[0].location.range.start.line, 4);
});

await test("identical single-line entries still report duplicates", ()=>{
	assert.equal(duplicates("    - Fix a problem.\n    - Fix a problem.\n").length, 1);
});

await test("nested entries are compared within their own parent", ()=>{
	assert.deepEqual(duplicates("    - Depot changes:\n      - Fix refueling.\n    - Provider changes:\n      - Fix refueling.\n"), []);
	assert.equal(duplicates("    - Depot changes:\n      - Fix refueling.\n      - Fix refueling.\n").length, 1);
});

await test("nested content distinguishes matching parent entries", ()=>{
	assert.deepEqual(duplicates("    - Fixes:\n      - Depot routing.\n    - Fixes:\n      - Provider routing.\n"), []);
	const result = duplicates("    - Fixes:\n      - Depot routing.\n    - Fixes:\n      - Depot routing.\n");
	assert.equal(result.length, 1);
	assert.equal(result[0].range.start.line, 6);
});

await test("categories and versions have separate duplicate scopes", ()=>{
	assert.deepEqual(duplicates(`    - Shared text.\n  Changes:\n    - Shared text.\n${separator}\nVersion: 0.9.0\nDate: 2026-10-20\n  Bugfixes:\n    - Shared text.\n`), []);
});

await test("reopened categories within one version retain duplicate detection", ()=>{
	assert.equal(duplicates("    - Fix a problem.\n  Changes:\n    - Add a feature.\n  Bugfixes:\n    - Fix a problem.\n").length, 1);
});
