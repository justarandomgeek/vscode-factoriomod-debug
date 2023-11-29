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


program.command("luals-addon [outdir]")
	.alias("sumneko-3rd")
	.description("Generate a library bundle for LuaLS (sumneko.lua) LSP")
	.requiredOption("-d, --docs <docsjson>", "Runtime docs")
	.option("-p, --protos <protosjson>", "Prototype docs")
	.action(async (outdir:string|undefined, options:{docs:string; protos?:string})=>{
		const docsettings = await getConfig("docs", {});
		const libdir = path.join(outdir ?? process.cwd(), "factorio", "library");

		const docs = new ApiDocGenerator((await fsp.readFile(options.docs, "utf8")).toString(), docsettings);

		let pdocs:ProtoDocGenerator|undefined;
		let resolve_link = (node:Link)=>{
			const matches = node.url.match(/^(.+?)(?:::(.+))?$/);
			if (matches) {
				node.url = "https://lua-api.factorio.com/latest"+docs.resolve_link(matches[1], matches[2]);
			}
		};
		if (docs.api_version === 4) {
			if (!options.protos) {
				console.log("prototype-api.json (specified with -p arg) is required for v4 docs");
				return;
			}
			pdocs = new ProtoDocGenerator((await fsp.readFile(options.protos, "utf8")).toString(), docsettings);

			resolve_link = (node:Link)=>{
				const matches = node.url.match(/^(runtime|prototype):(.+?)(?:::(.+))?$/);
				if (matches) {
					switch (matches[1]) {
						case 'runtime':
							node.url = "https://lua-api.factorio.com/latest"+docs.resolve_link(matches[2], matches[3]);
							break;
						case 'prototype':
							node.url = "https://lua-api.factorio.com/latest"+pdocs!.resolve_link(matches[2], matches[3]);
							break;
					}
				}
			};
		}

		const descr = remark()
			.use(function () {
				return async function(tree:Root, file:VFile) {
					visit(tree, "link", resolve_link);
				};
			});

		const format_description:DocDescriptionFormatter = async (description, doclink?)=>{
			const link = doclink ? `[View Documentation](${doclink.scope}:${doclink.member}${doclink.part?"::"+doclink.part:""})` : "" ;
			const result = String(await descr.process(`${description??""}\n\n${link}`.trim())).trim();
			return result;
		};

		await fsp.mkdir(libdir, { recursive: true });
		await Promise.all(
			[
				...await docs.generate_LuaLS_docs(format_description),
				...pdocs?.generate_LuaLS_docs(format_description) ?? [],
			].map(async plsfile=>{
				const lsfile = await plsfile;
				const file = createWriteStream(path.join(libdir, lsfile.name+".lua"));
				await lsfile.write(file);
				file.close();
			}));

		const lualsAddon = await import("../LuaLSAddon");
		await Promise.all((await lualsAddon.getLuaFiles()).map(async (file)=>{
			const filepath = path.join(outdir ?? process.cwd(), file.name);
			await fsp.mkdir(path.dirname(filepath), { recursive: true });
			return fsp.writeFile(filepath, Buffer.from(file.content));
		}));

		const config = await lualsAddon.getConfig(docs.application_version);
		await fsp.writeFile(path.join(outdir ?? process.cwd(), config.name), Buffer.from(config.content));
	});
