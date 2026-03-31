import {version}  from "../package.json";
let addonLuaFiles: { name: string; content: string }[];


// zip together the two arrays of imports...
import {default as files, filenames} from '../luals-addon/**/*.lua';

export function getLuaFiles() {
	if (!addonLuaFiles) {

		addonLuaFiles = [];

		for (let i = 0; i < files.length; i++) {
			addonLuaFiles.push({
				name: filenames[i].replace("../luals-addon/", ""),
				content: files[i].default,
			});
		}
	}

	return addonLuaFiles;
}

import configjson from "../luals-addon/factorio/config.json";

export function getConfig(factorioVersion?:string) {
	return {
		name: "factorio/config.json",
		content: JSON.stringify({
			...configjson,
			bundleVersion: version,
			factorioVersion: factorioVersion,
		}),
	};
}