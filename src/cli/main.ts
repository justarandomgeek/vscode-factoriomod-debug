#!/usr/bin/env node

import { program } from 'commander';
import { displayName, version as bundleVersion } from "../../package.json";

import "./mods";
import "./settings";
import "./run";
import "./datestamp";
import "./version";
import "./package";
import "./upload";
import "./details";
import "./publish";
import "./docs";
import "./lsp";
import "./scriptdat";

await program
	.description(`${displayName} ${bundleVersion}`)
	.helpCommand("help")
	.showHelpAfterError()
	.showSuggestionAfterError()
	// when launched by vscode-pretending-to-be-node this detects electron
	// but has node-style args, so force it...
	.parseAsync(process.argv, {from: "node"})
	.catch((err)=>{
		console.error(err);
		process.exit(1);
	})
	.then(()=>{
		// close IPC if it was open from parent...
		process.disconnect?.();
	});