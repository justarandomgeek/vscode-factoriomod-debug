import { commander } from '../cjs/fmtk-cjs-deps';
const program = commander.program

//vscode-languageserver handles these arguments
program.command("lsp")
	.description("Run LSP Server for Locale and Changelog features")
	.allowUnknownOption(true).allowExcessArguments(true)
	.action(async ()=>{
		const { runLanguageServer } = await import("../Language/Server");
		await runLanguageServer();
	});