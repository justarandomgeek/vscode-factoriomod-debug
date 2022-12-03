import { program } from 'commander';
import { displayName, version as bundleVersion } from "../../package.json";

import "./mods";
import "./settings";
import "./run";
import "./datestamp";
import "./version";
import "./package";
import "./upload";
import "./publish";
import "./docs";
import "./lsp";
import "./debug";

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
	})
	.then(()=>{
		// close IPC if it was open from parent...
		if (process.send) {
			process.disconnect();
		}
	});