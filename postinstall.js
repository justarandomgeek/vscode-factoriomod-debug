// this has to be js because node won't do native type-stripping/transforming
// on node_modules for installed packages
import * as path from "path";
import * as fsp from "fs/promises";
import { execSync } from "child_process";

if (process.env.npm_package_json === path.join(process.env.npm_config_local_prefix, "package.json")) {
	console.log('Running dev postinstall...');
	// and this import has to be deferred because devDependencies won't be present
	const { applyEdits, modify } = await import("jsonc-parser");
	execSync("npx patch-package", { stdio: 'inherit' });

	const json = await fsp.readFile("package.json", "utf8");
	const vscode_types = JSON.parse(json).devDependencies["@types/vscode"];// as string;
	const edits = modify(json, ["engines", "vscode"], vscode_types, {});
	await fsp.writeFile("package.json", applyEdits(json, edits));
} else {
	console.log('Skipping dev postinstall');
}