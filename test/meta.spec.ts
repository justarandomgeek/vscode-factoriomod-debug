import { test, suite } from "node:test";
import { expect } from "chai";
import {default as packagejson} from "../package.json" assert { type: "json" };

await suite('meta', async ()=>{
	await test('vscode engine and types versions should match', ()=>{
		expect(packagejson.engines.vscode).equals(packagejson.devDependencies["@types/vscode"]);
	});
});