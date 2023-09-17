import * as fsp from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import { getConfig } from "./util";
import { createWriteStream } from 'fs';

program.command("sumneko-3rd [outdir]")
	.description("Generate a library bundle for sumneko.lua LSP")
	.option("-d, --docs <docsjson>", "Include runtime docs")
	.option("-p, --protos <protosjson>", "Include prototype docs")
	.action(async (outdir:string|undefined, options:{docs?:string; protos?:string})=>{
		const sumneko3rd = await import("../Sumneko3rd");
		await Promise.all((await sumneko3rd.getLuaFiles()).map(async (file)=>{
			const filepath = path.join(outdir ?? process.cwd(), file.name);
			await fsp.mkdir(path.dirname(filepath), { recursive: true });
			return fsp.writeFile(filepath, Buffer.from(file.content));
		}));
		let factorionVersion:string|undefined;
		if (options.docs) {
			factorionVersion = await docscommand(options.docs, path.join(outdir ?? process.cwd(), "factorio", "library"));
		}
		if (options.protos) {
			factorionVersion = await protoscommand(options.protos, path.join(outdir ?? process.cwd(), "factorio", "library"));
		}
		const config = await sumneko3rd.getConfig(factorionVersion);
		await fsp.writeFile(path.join(outdir ?? process.cwd(), config.name), Buffer.from(config.content));
	});

program.command("docs <docjson> <outdir>")
	.description("Generate runtime api docs for sumneko.lua LSP")
	.action(async (docjson:string, outdir:string)=>{
		await docscommand(docjson, outdir);
	});

program.command("protos <protosjson> <outdir>")
	.description("Generate proto api docs for sumneko.lua LSP")
	.action(async (protosjson:string, outdir:string)=>{
		await protoscommand(protosjson, outdir);
	});

async function docscommand(docjson:string, outdir:string) {
	const { ApiDocGenerator } = await import('../ApiDocs/ApiDocGenerator');
	const docs = new ApiDocGenerator((await fsp.readFile(docjson, "utf8")).toString(), await getConfig("docs", {}));
	await fsp.mkdir(outdir, { recursive: true });
	docs.generate_sumneko_docs((filename:string)=>{
		return createWriteStream(path.join(outdir, filename));
	});
	return docs.application_version;
};

async function protoscommand(protojson:string, outdir:string) {
	const { ProtoDocGenerator } = await import('../ApiDocs/ProtoDocsGenerator');
	const docs = new ProtoDocGenerator((await fsp.readFile(protojson, "utf8")).toString(), await getConfig("docs", {}));
	await fsp.mkdir(outdir, { recursive: true });
	docs.generate_sumneko_docs((filename:string)=>{
		return createWriteStream(path.join(outdir, filename));
	});
	return docs.application_version;
};
