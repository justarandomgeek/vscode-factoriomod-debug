import * as fsp from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import { getConfig } from "./util";
import { createWriteStream } from 'fs';
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import type { Root, Link } from "mdast";
import { ApiDocGenerator } from '../ApiDocs/ApiDocGenerator';
import { ProtoDocGenerator } from '../ApiDocs/ProtoDocsGenerator';

program.command("sumneko-3rd [outdir]")
	.description("Generate a library bundle for sumneko.lua LSP")
	.requiredOption("-d, --docs <docsjson>", "Runtime docs")
	.requiredOption("-p, --protos <protosjson>", "Prototype docs")
	.action(async (outdir:string|undefined, options:{docs:string; protos:string})=>{
		const sumneko3rd = await import("../Sumneko3rd");
		await Promise.all((await sumneko3rd.getLuaFiles()).map(async (file)=>{
			const filepath = path.join(outdir ?? process.cwd(), file.name);
			await fsp.mkdir(path.dirname(filepath), { recursive: true });
			return fsp.writeFile(filepath, Buffer.from(file.content));
		}));
		const docsettings = await getConfig("docs", {});
		const libdir = path.join(outdir ?? process.cwd(), "factorio", "library");

		const docs = new ApiDocGenerator((await fsp.readFile(options.docs, "utf8")).toString(), docsettings);
		const pdocs = new ProtoDocGenerator((await fsp.readFile(options.protos, "utf8")).toString(), docsettings);

		const descr = remark()
			.use(function () {
				return async function(tree:Root, file:VFile) {
					visit(tree, "link", (node:Link)=>{
						const matches = node.url.match(/^(runtime|prototype):(.+?)(?:::(.+))?$/);
						if (matches) {
							switch (matches[1]) {
								case 'runtime':
									node.url = "https://lua-api.factorio.com/latest"+docs.resolve_link(matches[2], matches[3]);
									break;
								case 'prototype':
									node.url = "https://lua-api.factorio.com/latest"+pdocs.resolve_link(matches[2], matches[3]);
									break;
							}

						}
					});
				};
			});

		const format_description = async (description?:string)=>{
			if (!description) { return; }
			const result = String(await descr.process(description)).trim();
			return result;
		};

		const createLibFileWriteStream =
			(filename:string)=>createWriteStream(path.join(libdir, filename));


		await fsp.mkdir(libdir, { recursive: true });
		docs.generate_sumneko_docs(createLibFileWriteStream);
		pdocs.generate_sumneko_docs(createLibFileWriteStream, format_description);
		const config = await sumneko3rd.getConfig(docs.application_version);
		await fsp.writeFile(path.join(outdir ?? process.cwd(), config.name), Buffer.from(config.content));
	});