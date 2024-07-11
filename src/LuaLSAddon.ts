import {version}  from "../package.json";
let addonLuaFiles: { name: string; content: string }[];


// zip together the two arrays of imports...


export async function getLuaFiles() {
	if (!addonLuaFiles) {

		addonLuaFiles = [];
		// @ts-expect-error import
		const glob = await import('../luals-addon/**/*.lua');
		const files = glob.default;
		const filenames = glob.filenames;

		for (let i = 0; i < files.length; i++) {
			addonLuaFiles.push({
				name: (filenames[i] as string).replace("../luals-addon/", ""),
				content: files[i].default,
			});
		}
	}

	return addonLuaFiles;
}

export async function getConfig(factorioVersion?:string) {
	return {
		name: "factorio/config.json",
		content: JSON.stringify(Object.assign(
			await import("../luals-addon/factorio/config.json"),
			{
				bundleVersion: version,
				factorioVersion: factorioVersion,
			})),
	};
}