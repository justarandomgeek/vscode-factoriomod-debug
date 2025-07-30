import * as fsp from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import { createWriteStream } from 'fs';

import { GenerateDocs } from '../ApiDocs/GenerateDocs';

async function fetch_docs(url:string) {
	const result = await fetch(url);
	if (!result.ok) {
		throw new Error(`Error fetching ${url} : ${result.statusText}`);
	}
	return result.text();
}

program.command("luals-addon [outdir]")
	.alias("sumneko-3rd")
	.description("Generate a library bundle for LuaLS (sumneko.lua) LSP")
	.option("-d, --docs <docsjson>", "Runtime docs")
	.option("-p, --protos <protosjson>", "Prototype docs")
	.option("-o, --online [version]", "Use online docs")
	.action(async (outdir:string|undefined, options:{docs?:string; protos?:string; online?:string})=>{
		let docsjson:string;
		let protosjson:string;
		if (options.docs && options.protos) {
			// use files
			docsjson = (await fsp.readFile(options.docs, "utf8")).toString();
			protosjson = (await fsp.readFile(options.protos, "utf8")).toString();
		} else if (options.docs || options.protos) {
			// error: must specify both
			throw new Error("Using local json files must specify both files");
		} else {
			// use online...
			const version = options.online ?? "latest";

			docsjson = await fetch_docs(`https://lua-api.factorio.com/${version}/runtime-api.json`);
			protosjson = await fetch_docs(`https://lua-api.factorio.com/${version}/prototype-api.json`);
		}

		await GenerateDocs(docsjson, protosjson, async (subpath, write)=>{
			const filepath = path.join(outdir ?? process.cwd(), subpath);
			await fsp.mkdir(path.dirname(filepath), { recursive: true });
			const file = createWriteStream(filepath);
			await write(file);
			file.close();
		});
	});
