import { program } from 'commander';
import { getPackageinfo, doPackageDetails } from "./tasks";

program.command("details")
	.description("Update mod details")
	.option("--readme <readme.md>")
	.option("--faq <faq.md>")
	.action(async (options:{
		readme?: string
		faq?: string
	})=>{
		const info = await getPackageinfo();
		return doPackageDetails(info, options);
	});