import type { ExtensionContext } from 'vscode';
export async function activate(context:ExtensionContext) {
	const extension = await import("./extension");
	extension.activate(context);
}
if (require.main === module) {
	import("./commandline");
}