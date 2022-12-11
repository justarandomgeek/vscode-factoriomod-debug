import * as fsp from 'fs/promises';
import * as crypto from "crypto";
import { program } from 'commander';
import { remark } from "remark";
import type { VFile } from "vfile";
import type { Node } from "unist";
import type { Image } from "mdast";
import { visit } from "unist-util-visit";
import { addModImage, editModDetails, editModImages, getPackageinfo, ModPortalDetailsEdit } from "./tasks";
import { getModInfo, ModPortalImage } from '../ModManager';
import path from 'path';
//import type { ModCategory, ModLicense } from '../ModManager';

//@ts-ignore
import readdirGlob from 'readdir-glob';

async function addGalleryImage(
	filename:string,
	modname:string,
	images:ModPortalImage[],
	usedImageIDs:Set<string>,
):Promise<ModPortalImage|undefined> {
	const image = await fsp.readFile(filename).catch(()=>undefined);
	if (!image) {
		// can't upload a file we can't read...
		return;
	}

	const id = crypto.createHash("sha1").update(image).digest("hex");
	usedImageIDs.add(id);

	const known = images.find(i=>i.id===id);
	if (known) {
		// it's already in the gallery, just use it!
		return known;
	}

	// otherwise upload it, and add it to our known list...
	const newImage = await addModImage(modname, image, path.basename(filename));
	images.push(newImage);
	return newImage;
}

async function processMarkdown(
	filename:string,
	modname:string,
	images:ModPortalImage[],
	usedImageIDs:Set<string>,
):Promise<string|undefined> {
	const file = await fsp.readFile(filename, "utf8").catch(()=>undefined);
	if (!file) { return; }

	const result = await remark().use(function () {
		return async function(tree:Node, file:VFile) {
			const imageNodes = new Map<string, Image[]>();
			visit(tree, "image", (node:Image)=>{
				let nodes = imageNodes.get(node.url);
				if (nodes) {
					nodes.push(node);
				} else {
					imageNodes.set(node.url, [node]);
				}
			});
			for (const [url, nodes] of imageNodes) {
				if (url.match(/^(http(s?)|data):/)) { continue; }

				const image = await addGalleryImage(path.resolve(file.cwd, url), modname, images, usedImageIDs);
				if (!image) { continue; }

				nodes.forEach(node=>{ node.url = image.url; });
			}
		};
	}).process(file);

	return String(result);
}

program.command("details")
	.description("Update mod details")
	.option("--readme <readme.md>")
	.option("--faq <faq.md>")
	.action(async (options:{
		readme?: string
		faq?: string
	})=>{
		const info = await getPackageinfo();

		const details:ModPortalDetailsEdit = {
			title: info.title,
			homepage: info.homepage,
			summary: info.description,
		};

		const { images } = await getModInfo(info.name, true);
		const usedImageIDs = new Set<string>();

		const gallery = info.package?.gallery;
		if (gallery) {
			for (const glob of gallery) {
				const files = await new Promise<string[]>((resolve, reject)=>{
					const files:string[] = [];
					const globber = readdirGlob(process.cwd(), {pattern: glob, nodir: true});
					globber.on('match', (match:{ relative:string; absolute:string })=>{
						files.push(match.absolute);
					});
					globber.on('error', (err:unknown)=>reject(err));
					globber.on('end', ()=>resolve(files));
				});
				await Promise.all(files.sort().map(async (f)=>addGalleryImage(f, info.name, images, usedImageIDs)));
			}

		}

		const readme = await processMarkdown(
			options.readme ?? info.package?.readme ?? "readme.md",
			info.name, images, usedImageIDs);
		if (readme) { details.description = readme; }
		const faq = await processMarkdown(
			options.faq ?? info.package?.faq ?? "faq.md",
			info.name, images, usedImageIDs);
		if (faq) { details.faq = faq; }

		// keep existign images by default unless `gallery` is specified
		// then prune by default to keep synced
		if (info.package?.gallery) {
			if (info.package.prune_gallery===false) {
				for (const image of images) {
					usedImageIDs.add(image.id);
				}
			}

			console.log(`Sorting gallery ...`);
			await editModImages(info.name, Array.from(usedImageIDs));
		}

		console.log(`Updating details ...`);
		await editModDetails(info.name, details);
	});