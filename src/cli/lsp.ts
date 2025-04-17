import { program } from 'commander';

//vscode-languageserver handles these arguments
program.command("lsp")
	.description("Run LSP Server for Locale and Changelog features")
	.allowUnknownOption(true).allowExcessArguments(true)
	.action(async ()=>{
		const { runLanguageServer } = await import("../Language/Server");
		await runLanguageServer();
	});