import {version}  from "../package.json";
let sumneko3rdFiles: { name: string; content: string }[];


// zip together the two arrays of imports...
export default async function() {
	if (!sumneko3rdFiles) {

		sumneko3rdFiles = [];
		// @ts-ignore
		const glob = await import('./sumneko-3rd/**/*.lua');
		const files = glob.default;
		const filenames = glob.filenames;

		for (let i = 0; i < files.length; i++) {
			sumneko3rdFiles.push({
				name: (filenames[i] as string).replace("./sumneko-3rd/", ""),
				content: files[i].default,
			});
		}

		sumneko3rdFiles.push({
			name: "factorio/config.json",
			content: JSON.stringify(Object.assign(
				await import("./sumneko-3rd/factorio/config.json"),
				{
					bundleVersion: version,
				})),
		});
	}

	return sumneko3rdFiles;
}