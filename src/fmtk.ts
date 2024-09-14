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
// When vscode forks external dap process, require.main is undefined...
if (require.main === module || require.main === undefined
	//@ts-expect-error - only defined when loaded as extension
	&& !_VSCODE_PRODUCT_JSON
) {
	import("./cli/main");
}


// If neither of the above, we're being loaded as a library
// so pass through the exports for the useful bits...
export * as EncodingUtil from "./Util/EncodingUtil";
export * from "./Util/BufferSplitter";
export * from "./Util/PropertyTree";
export * from "./Util/MapVersion";
