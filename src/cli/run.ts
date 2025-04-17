import { program } from 'commander';
import { runPackageScript, getPackageinfo } from "./tasks";

program.command("run <script> [args...]")
	.description("Run a script from info.json#/package/scripts")
	.action(async (scriptname:string, args:string[])=>{
		process.exit(await runPackageScript(scriptname, await getPackageinfo(), undefined, args));
	});