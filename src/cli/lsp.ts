import { program } from 'commander';
import { runLanguageServer } from "../Language/Server";

//vscode-languageserver handles these arguments
program.command("lsp")
	.description("Run LSP Server for Locale and Changelog features")
	.allowUnknownOption(true).allowExcessArguments(true)
	.action(async ()=>{
		await runLanguageServer();
	});