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
import "./debug";
import "./scriptdat";

if (process.env["FMTK_TEST_ARGV"]) {
	try {
		const args = JSON.parse(process.env["FMTK_TEST_ARGV"]) as string[];
		process.argv.push(...args);
		delete process.env["FMTK_TEST_ARGV"];
	} catch (error) {
		console.log(`Error using extra args from FMTK_TEST_ARGV: ${error}`);
		process.exit(1);
	}
}


program
	.description(`${displayName} ${bundleVersion}`)
	.addHelpCommand()
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
		if (process.send) {
			process.disconnect();
		}
	});