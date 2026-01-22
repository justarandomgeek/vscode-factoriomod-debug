import path from 'path';
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type { Writable } from "stream";
import type { VFile } from "vfile";
import type { Root, Link } from "mdast";
import { ApiDocGenerator } from './ApiDocGenerator';
import { ProtoDocGenerator } from './ProtoDocsGenerator';
import * as LuaLSAddon from "../LuaLSAddon";


export async function GenerateDocs(docsjson:string, protosjson:string, sdumpjson:string|undefined, pdumpjson:string|undefined, write_file:(subpath:string, write:(output:Writable)=>void|Promise<void>)=>Promise<void>) {
	const settings = sdumpjson && JSON.parse(sdumpjson);
	const prototypes = pdumpjson && JSON.parse(pdumpjson);

	const docs = new ApiDocGenerator(docsjson, settings, prototypes);
	const pdocs = new ProtoDocGenerator(protosjson, settings, prototypes);

	const resolve_link = (node:Link)=>{
		const matches = node.url.match(/^(runtime|prototype):(.+?)(?:::(.+))?$/);
		if (matches) {
			switch (matches[1]) {
				case 'runtime':
					const rlink = docs.resolve_link(matches[2], matches[3]);
					if (rlink) {
						node.url = "https://lua-api.factorio.com/latest"+rlink;
					}
					break;
				case 'prototype':
					const plink = pdocs.resolve_link(matches[2], matches[3]);
					if (plink) {
						node.url = "https://lua-api.factorio.com/latest"+plink;
					}
					break;
			}
		}
	};

	const descr = remark()
		.use(function () {
			return function(tree:Root, file:VFile) {
				visit(tree, "link", resolve_link);
			};
		});

	const format_description:DocDescriptionFormatter = async (description, doclink?)=>{
		const link = doclink ? `[View Documentation](${doclink.scope}:${doclink.member}${doclink.part?"::"+doclink.part:""})` : "" ;
		const result = String(await descr.process(`${description??""}\n\n${link}`.trim())).trim();
		return result;
	};

	const libdir = path.posix.join("factorio", "library");
	await Promise.all(
		[
			...await docs.generate_LuaLS_docs(format_description),
			...await pdocs.generate_LuaLS_docs(format_description),
		].map(async plsfile=>{
			const lsfile = await plsfile;
			await write_file(path.posix.join(libdir, lsfile.name+".lua"), (output)=>lsfile.write(output));
		}));

	await Promise.all(LuaLSAddon.getLuaFiles().map(async (file)=>{
		await write_file(file.name, (output)=>{ output.write(file.content); });
	}));

	const config = LuaLSAddon.getConfig(docs.application_version);
	await write_file(config.name, (output)=>{ output.write(config.content); });
}