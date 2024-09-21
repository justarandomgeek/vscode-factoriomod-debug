import * as fsp from 'fs/promises';
import { program } from 'commander';

import { BufferStream, ScriptDat } from '../fmtk';

program.command("scriptdat <file>")
	.description("Dump script.dat")
	.action(async (file:string)=>{
		const settings = new ScriptDat(new BufferStream(await fsp.readFile(file)));
		console.log(JSON.stringify({
			version: settings.version.format(),
			data: settings.data,
		}, undefined, 2));
	});