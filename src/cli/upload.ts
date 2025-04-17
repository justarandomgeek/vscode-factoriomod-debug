import path from 'path';
import * as fsp from 'fs/promises';
import { program } from 'commander';
import { addModRelease } from "./tasks";

program.command("upload <zipname> [name]")
	.description("Upload a zip package to the mod portal")
	.action(async (zipname:string, name?:string)=>{

		if (!name) {
			const basename = path.basename(zipname, ".zip");
			const match = basename.match(/^(.*?)(_(\d+\.){2}\d+)?$/);
			if (match) {
				name = match[1];
			}
		}

		if (!name) {
			console.log("Unable to determine `name`");
			return;
		}

		await addModRelease(name, await fsp.readFile(zipname));
	});