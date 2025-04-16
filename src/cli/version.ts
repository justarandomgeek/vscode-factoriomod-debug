import * as fsp from 'fs/promises';
import { commander } from '../cjs/fmtk-cjs-deps';
const program = commander.program
import type { ModInfo } from "../vscode/ModPackageProvider";
import { doPackageVersion } from "./tasks";

program.command("version")
	.description("Increment the mod version")
	.action(async ()=>{
		const json = await fsp.readFile("info.json", "utf8");
		const info = JSON.parse(json) as ModInfo;
		await doPackageVersion(info, json);
	});