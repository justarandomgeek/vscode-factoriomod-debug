import { test, suite } from "mocha";
import { expect } from "chai";
import { engines, devDependencies } from "../package.json";

suite('meta', ()=>{
	test('vscode engine and types versions should match', ()=>{
		expect(engines.vscode).equals(devDependencies["@types/vscode"]);
	});
});