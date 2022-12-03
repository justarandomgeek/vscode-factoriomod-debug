import { createWriteStream } from "fs";
import { program } from 'commander';
import { URI, Utils } from 'vscode-uri';
import { getPackageinfo, doPackageZip  } from "./tasks";

program.command("package")
	.description("Build a zip package")
	.option("--outdir <outdir>", "", "")
	.action(async (options)=>{
		const info = await getPackageinfo();
		const zipuri = Utils.resolvePath(URI.file(process.cwd()), options.outdir, `${info.name}_${info.version}.zip`);
		const zipoutput = createWriteStream(zipuri.fsPath);
		const zip = await doPackageZip(info);
		zip.pipe(zipoutput);
		await zip.finalize();
		console.log(`Built ${info.name}_${info.version}.zip ${zip.pointer()} bytes`);
	});