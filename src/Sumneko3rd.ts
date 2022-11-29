// zip together the two arrays of imports...
const sumneko3rdFiles: { name: string; content: string }[] = [];
// @ts-ignore
import { default as files, filenames } from './sumneko-3rd/**/*.lua';
import config from "./sumneko-3rd/factorio/config.json";

for (let i = 0; i < files.length; i++) {
	sumneko3rdFiles.push({
		name: (filenames[i] as string).replace("./sumneko-3rd/", ""),
		content: files[i].default,
	});
}

sumneko3rdFiles.push({
	name: "factorio/config.json",
	content: JSON.stringify(config),
});

export default sumneko3rdFiles;