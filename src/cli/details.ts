import * as fsp from 'fs/promises';
import { program } from 'commander';
import { doPackageUploadDetails } from "./tasks";
import type { ModInfo } from "../vscode/ModPackageProvider";
//import type { ModCategory, ModLicense } from '../ModManager';

program.command("details")
	.description("Update mod details")
	.option("--readme <readme.md>")
	.option("--faq <faq.md>")
	.action(async (options:{
		// from command line args
		deprecated?: boolean
		source_url?: string

		// command line flags or args to specify file
		readme?: string // readme.md or arg
		faq?: string // faq.md or arg
	},)=>{
		const json = await fsp.readFile("info.json", "utf8");
		const info = JSON.parse(json) as ModInfo;

		const details:Parameters<typeof doPackageUploadDetails>[1] = {
			title: info.title,
			homepage: info.homepage,
			summary: info.description,
		};

		const readme = await fsp.readFile(options.readme ?? "readme.md", "utf8").catch(()=>undefined);
		if (readme) { details.description = readme; }
		const faq = await fsp.readFile(options.faq ?? "faq.md", "utf8").catch(()=>undefined);
		if (faq) { details.faq = faq; }
		await doPackageUploadDetails(info.name, details);
	});