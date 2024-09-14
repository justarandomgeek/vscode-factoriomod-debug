#!/usr/bin/env node

// When loaded by vscode, `activate` is called to load the extension code
// This stub defers the actual loading until then, so no vscode deps are
// required for standalone execution
import type { ExtensionContext } from 'vscode';
export async function activate(context:ExtensionContext) {
	const extension = await import("./vscode/extension");
	extension.activate(context);
}

// When run from the command line, import `main` for CLI interface
// vscode 1.94 and up has require.main === undefined, so detect module.parent instead...
if (!module.parent) {
	import("./cli/main");
}


// If neither of the above, we're being loaded as a library
// so pass through the exports for the useful bits...
export * as EncodingUtil from "./Util/EncodingUtil";
export * from "./Util/BufferSplitter";
export * from "./Util/PropertyTree";
export * from "./Util/MapVersion";
