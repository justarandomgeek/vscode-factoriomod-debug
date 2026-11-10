import * as os from "os";
import * as fsp from 'fs/promises';
import { program } from 'commander';

import { URI, Utils } from 'vscode-uri';
import { fsAccessor } from './util';
import type { LocalFactorioVersion } from '../vscode/FactorioVersion';
import { ActiveFactorioVersion } from '../vscode/FactorioVersion';
import { ApiDocGenerator } from '../ApiDocs/ApiDocGenerator';
import { discoverTestSpecs } from "../Test/TestSpec";

program.command("test <factorioPath>")
	.description("Run tests from tests.json")
	.option("-d, --docs <docsPath>", "path to runtime-api.json")
	.option("-c, --config <configPath>", "path to config.ini")
	.action(async (factorioPath:string, options:{ docs?:string; config?:string })=>{
		const fv: LocalFactorioVersion = {
			name: "standalone",
			factorioPath: factorioPath,
			configPath: options.config,
			docsPath: options.docs,
		};
		const docsPath = Utils.joinPath(URI.file(factorioPath),
			fv.docsPath ? fv.docsPath :
			(os.platform() === "darwin") ? "../../doc-html/runtime-api.json" :
			"../../../doc-html/runtime-api.json"
		);
		const docsjson = await fsp.readFile(docsPath.fsPath, "utf8");
		const activeVersion = new ActiveFactorioVersion(fsAccessor, fv, new ApiDocGenerator(docsjson));

		// start a single session that communicates via stdin/stdout
		const specs = discoverTestSpecs(URI.file(process.cwd()), fsAccessor);

	});