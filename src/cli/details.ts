import * as fsp from 'fs/promises';
import * as crypto from "crypto";
import { program } from 'commander';
import { remark } from "remark";
import type { VFile } from "vfile";
import type { Node } from "unist";
import type { Image } from "mdast";
import { visit } from "unist-util-visit";
import { addModImage, editModDetails, ModPortalDetailsEdit } from "./tasks";
import type { ModInfo } from "../vscode/ModPackageProvider";
import { getModInfo, ModPortalImage } from '../ModManager';
import path from 'path';
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
	})=>{
		const info = JSON.parse(await fsp.readFile("info.json", "utf8")) as ModInfo;

		const details:ModPortalDetailsEdit = {
			title: info.title,
			homepage: info.homepage,
			summary: info.description,
		};

		const { images } = await getModInfo(info.name, true);
		const usedImages = new Set<string>();
		const usedFiles = new Map<string, ModPortalImage>();

		async function processMarkdown(filename:string):Promise<string|undefined> {
			const file = await fsp.readFile(filename, "utf8").catch(()=>undefined);
			if (!file) { return undefined; }

			const result = remark().use(function () {
				return async function(tree:Node, file:VFile) {
					const imageNodes:Image[] = [];
					visit(tree, "image", (node:Image)=>{
						imageNodes.push(node);
					});
					for (const node of imageNodes) {
						if (node.url.match(/^(http(s?)|data):/)) {
							// don't touch real urls...
							continue;
						}

						let used = usedFiles.get(node.url);

						if (used) {
							// we've seen this one already, do it the same...
							node.url = used.url;
							continue;
						}

						const imagepath = path.resolve(file.cwd, node.url);
						const image = await fsp.readFile(imagepath).catch(()=>undefined);
						if (!image) {
							// can't upload a file we can't read...
							continue;
						}

						const id = crypto.createHash("sha1").update(image).digest("hex");
						usedImages.add(id);

						const known = images.find(i=>i.id===id);
						if (known) {
							// it's already in the gallery, just use it!
							usedFiles.set(filename, known);
							node.url = known.url;
							continue;
						}

						// otherwise upload it, and add it to our known list...
						const newImage = await addModImage(info.name, image, node.url);
						images.push(newImage);
						usedFiles.set(filename, newImage);
						node.url = newImage.url;
					}
				};
			}).process(file);

			return String(await result);
		}

		const readme = await processMarkdown(options.readme ?? "readme.md");
		if (readme) { details.description = readme; }
		const faq = await processMarkdown(options.faq ?? "faq.md");
		if (faq) { details.faq = faq; }

		await editModDetails(info.name, details);
	});