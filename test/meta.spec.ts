import { test, suite } from "node:test";
import assert from 'node:assert/strict';
import {default as packagejson} from "../package.json" assert { type: "json" };

await suite('meta', async ()=>{
	await test('vscode engine and types versions should match', ()=>{
		assert.equal(packagejson.engines.vscode, packagejson.devDependencies["@types/vscode"]);
	});
});