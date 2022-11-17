// zip together the two arrays of imports...
const sumneko3rdFiles: { name: string; content: string }[] = [];
// @ts-ignore
import { default as files, filenames } from './sumneko-3rd/**/*.lua';
for (let i = 0; i < files.length; i++) {
	sumneko3rdFiles.push({
		name: filenames[i],
		content: files[i].default,
	});
}

export default sumneko3rdFiles;