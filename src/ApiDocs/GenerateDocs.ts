import path from 'path';
import { remark } from "remark";
import { visit } from "unist-util-visit";
import type { Writable } from "stream";
import type { VFile } from "vfile";
import type { Root, Link } from "mdast";
import { ApiDocGenerator } from './ApiDocGenerator';
import { ProtoDocGenerator } from './ProtoDocsGenerator';
import * as LuaLSAddon from "../LuaLSAddon";
import { URI } from 'vscode-uri';
import { Utils } from "vscode-uri";

export async function GenerateDocs(docsjson:string, protosjson:string, baseuri:URI, sdumpjson:string|undefined, pdumpjson:string|undefined, write_file:(subpath:string, write:(output:Writable)=>void|Promise<void>)=>Promise<void>) {
	const settings = sdumpjson && JSON.parse(sdumpjson);
	const prototypes = pdumpjson && JSON.parse(pdumpjson);

	const pdocs = new ProtoDocGenerator(protosjson, settings, prototypes);
	const docs = new ApiDocGenerator(docsjson, pdocs, settings, prototypes);

	console.log(`Loaded Prototype docs ${pdocs.application_version}`);
	console.log(`Loaded Runtime docs ${docs.application_version}`);

	if (settings) { console.log(`With Settings Dump`); }
	if (prototypes) { console.log(`With Prototypes Dump`); }

	const resolve_link = (node:Link)=>{
		const matches = node.url.match(/^(runtime|prototype|auxiliary):(.+?)(?:::(.+))?$/);
		if (matches) {
			switch (matches[1]) {
				case 'runtime':
					const rlink = docs.resolve_link(matches[2], matches[3]);
					if (rlink) {
						const uri = URI.parse(rlink);
						node.url = Utils.joinPath(baseuri, uri.path).with({query: uri.query, fragment: uri.fragment}).toString();
					}
					break;
				case 'prototype':
					const plink = pdocs.resolve_link(matches[2], matches[3]);
					if (plink) {
						const uri = URI.parse(plink);
						node.url = Utils.joinPath(baseuri, plink).with({query: uri.query, fragment: uri.fragment}).toString();
					}
					break;
				case 'auxiliary':
					node.url = Utils.joinPath(baseuri, `${matches[2]}.html`).toString();
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