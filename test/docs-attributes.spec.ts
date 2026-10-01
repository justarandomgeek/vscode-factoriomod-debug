import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { forkTest, forkTestFails } from "./util.ts";

const cli = path.resolve(import.meta.dirname, "../dist/fmtk-cli.js");
const member = (name:string, read_type?:ApiType, write_type?:ApiType, optional = false):ApiAttribute=>({name, read_type, write_type, optional, order: 0, description: `Description for ${name}.`});
const struct = (attributes:ApiAttribute[]):ApiType=>({complex_type: "LuaStruct", attributes});

async function fixture() {
	const root = path.resolve(import.meta.dirname, "../build/test-work/docs-attributes");
	await mkdir(root, {recursive: true});
	const dir = await mkdtemp(path.join(root, "case-"));
	const runtime = {application: "factorio", application_version: "2.1.20", api_version: 6, stage: "runtime",
		events: [], defines: [], concepts: [], global_objects: [], global_functions: [],
		classes: [{name: "Sample", order: 0, description: "Sample", abstract: false, methods: [], operators: [], attributes: [
			member("value", "ReadValue", "WriteValue", true), member("equal", "string", "string"),
			member("readonly", "string"), member("writeonly", undefined, "number"),
			member("nested", struct([member("field", "number", "string")])),
			member("converted", struct([member("out", "number")]), struct([member("input", "string")])),
		]}, {name: "LuaSettings", order: 1, description: "Overlay", abstract: false, methods: [], operators: [],
			attributes: [member("startup", "ReadValue", "WriteValue")]}]};
	const protos = {application: "factorio", application_version: "2.1.20", api_version: 6, stage: "prototype", types: [], prototypes: []};
	await writeFile(path.join(dir, "runtime.json"), JSON.stringify(runtime));
	await writeFile(path.join(dir, "prototype.json"), JSON.stringify(protos));
	return {dir, args: ["--docs", path.join(dir, "runtime.json"), "--protos", path.join(dir, "prototype.json")]};
}

async function files(dir:string, prefix = ""):Promise<Record<string, string>> {
	const result:Record<string, string> = {};
	for (const entry of await readdir(path.join(dir, prefix), {withFileTypes: true})) {
		const name = path.join(prefix, entry.name);
		if (entry.isDirectory()) { Object.assign(result, await files(dir, name)); } else { result[name] = await readFile(path.join(dir, name), "utf8"); }
	}
	return result;
}

await test("docs preserves asymmetric attributes only for the EmmyLua target", async ()=>{
	const {dir, args} = await fixture();
	for (const target of ["default", "luals", "emmylua"]) {
		await forkTest(cli, ["docs", path.join(dir, target), ...args, ...(target === "default" ? [] : ["--target", target])]);
	}
	assert.deepEqual(await files(path.join(dir, "default")), await files(path.join(dir, "luals")));
	const legacy = await readFile(path.join(dir, "default/factorio/library/runtime-api/Sample.lua"), "utf8");
	assert.match(legacy, /---@field value\? WriteValue/);
	assert.doesNotMatch(legacy, /---@field \((read|write)\)/);
	const output = await readFile(path.join(dir, "emmylua/factorio/library/runtime-api/Sample.lua"), "utf8");
	assert.match(output, /---@field \(read\) value\? ReadValue/);
	assert.match(output, /---@field \(write\) value\? WriteValue/);
	assert.match(output, /---@field equal string/);
	assert.match(output, /---@field readonly string/);
	assert.match(output, /---@field writeonly number/);
	assert.match(output, /---@field \(read\) field number/);
	assert.match(output, /---@field \(write\) field string/);
	assert.match(output, /---@class \(exact\) Sample.converted.read/);
	assert.match(output, /---@class \(exact\) Sample.converted.write/);
	const overlay = await readFile(path.join(dir, "emmylua/factorio/library/runtime-api/LuaSettings.lua"), "utf8");
	assert.match(overlay, /---@field startup StartupModSettings/);
	assert.doesNotMatch(overlay, /---@field \((read|write)\)/);
});

await test("docs rejects an unknown target", async ()=>{
	const result = await forkTestFails(cli, ["docs", "--target", "unknown"]);
	assert.notEqual(result.code, 0);
});
