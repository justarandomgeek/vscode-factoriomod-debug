import * as fsp from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import { getConfigGetter } from "./util";

program.command("sumneko-3rd [outdir]")
	.description("Generate a library bundle for sumneko.lua LSP")
	.option("-d, --docs <docsjson>", "Include runtime docs")
	.action(async (outdir:string|undefined, options:{docs?:string})=>{
		await Promise.all((await (await import("../Sumneko3rd")).default()).map(async (file)=>{
			const filepath = path.join(outdir ?? process.cwd(), file.name);
			await fsp.mkdir(path.dirname(filepath), { recursive: true });
			return fsp.writeFile(filepath, Buffer.from(file.content));
		}));
		if (options.docs) {
			await docscommand(options.docs, path.join(outdir ?? process.cwd(), "factorio", "library"));
		}
	});

program.command("docs <docjson> <outdir>")
	.description("Generate runtime api docs for sumneko.lua LSP")
	.action(docscommand);
async function docscommand(docjson:string, outdir:string) {
	const { ApiDocGenerator } = await import('../ApiDocs/ApiDocGenerator');
	const docs = new ApiDocGenerator((await fsp.readFile(docjson, "utf8")).toString(), await getConfigGetter("doc", {}));
	await fsp.mkdir(outdir, { recursive: true });
	await docs.generate_sumneko_docs(async (filename:string, buff:Buffer)=>{
		await fsp.writeFile(path.join(outdir, filename), buff);
	});
};
