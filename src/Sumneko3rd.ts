import {version}  from "../package.json";
let sumneko3rdLuaFiles: { name: string; content: string }[];


// zip together the two arrays of imports...


export async function getLuaFiles() {
	if (!sumneko3rdLuaFiles) {

		sumneko3rdLuaFiles = [];
		// @ts-ignore
		const glob = await import('../sumneko-3rd/**/*.lua');
		const files = glob.default;
		const filenames = glob.filenames;

		for (let i = 0; i < files.length; i++) {
			sumneko3rdLuaFiles.push({
				name: (filenames[i] as string).replace("../sumneko-3rd/", ""),
				content: files[i].default,
			});
		}
	}

	return sumneko3rdLuaFiles;
}

export async function getConfig(factorioVersion?:string) {
	return {
		name: "factorio/config.json",
		content: JSON.stringify(Object.assign(
			await import("../sumneko-3rd/factorio/config.json"),
			{
				bundleVersion: version,
				factorioVersion: factorioVersion,
			})),
	};
}