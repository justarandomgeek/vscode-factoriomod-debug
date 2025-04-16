import { commander } from '../cjs/fmtk-cjs-deps';
const program = commander.program

import { getPackageinfo, doPackageDatestamp } from "./tasks";

program.command("datestamp")
	.description("Datestamp the current changelog section")
	.action(async ()=>{
		const info = await getPackageinfo();
		await doPackageDatestamp(info);
	});