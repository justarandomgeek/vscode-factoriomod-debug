#!/usr/bin/env node

// When loaded by vscode, `activate` loads the extension code
import type { ExtensionContext } from 'vscode';
export async function activate(context:ExtensionContext) {
	const extension = await import("./vscode/extension");
	extension.activate(context);
}

// When run from the command line, import `main` for CLI interface
if (require.main === module) {
	import("./cli/main");
}

export * as EncodingUtil from "./Util/EncodingUtil";