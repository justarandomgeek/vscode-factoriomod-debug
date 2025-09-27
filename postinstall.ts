import { execSync } from "child_process";
import { applyEdits, modify } from "jsonc-parser";
import * as fsp from 'fs/promises';

if (process.env.NODE_ENV !== 'production') {
	console.log('Running dev postinstall...');
	execSync("npx patch-package", { stdio: 'inherit' });

	const json = await fsp.readFile("package.json", "utf8");
	const vscode_types = JSON.parse(json).devDependencies["@types/vscode"] as string;
	const edits = modify(json, ["engines", "vscode"], vscode_types, {});
	await fsp.writeFile("package.json", applyEdits(json, edits));
} else {
	console.log('Skipping dev postinstall');
}