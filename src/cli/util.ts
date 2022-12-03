
import * as fsp from 'fs/promises';

import type { FileSystem, FileType } from 'vscode';
import type { URI } from 'vscode-uri';

const fsAccessor:  Pick<FileSystem, "readFile"|"writeFile"|"stat"> = {
	async readFile(uri:URI) {
		return fsp.readFile(uri.fsPath);
	},
	async writeFile(uri:URI, content:Buffer) {
		return fsp.writeFile(uri.fsPath, content);
	},
	async stat(uri:URI) {
		const stat = await fsp.stat(uri.fsPath);

		return {
			size: stat.size,
			// eslint-disable-next-line no-bitwise
			type: (stat.isFile() ? <FileType>1 : 0) |
				(stat.isDirectory() ? <FileType>2 : 0) |
				(stat.isSymbolicLink() ? <FileType>64 : 0),
			ctime: stat.ctime.valueOf(),
			mtime: stat.mtime.valueOf(),
		};
	},
};

export { fsAccessor };

export async function getConfig<T extends {}>(section:string, defaults:T):Promise<T> {
	return Object.assign(
		defaults,
		await new Promise((resolve)=>{
			if (process.send) {
				const gotconfig = (msg:{cmd:string;section:string;config:{}})=>{
					if (msg.cmd === "config" && msg.section === section) {
						resolve(msg.config);
					}
					process.off("message", gotconfig);
				};
				process.on("message", gotconfig);
				process.send({cmd: "getConfig", section: section});
			} else {
				resolve(undefined);
			}
		})
	);
}

export async function getConfigGetter<T extends {}>(section:string, defaults:T) {
	const config = await getConfig(section, defaults);
	return {
		get: function<K extends keyof T>(key:K, defaultValue?:T[K]) {
			return config[key] ?? defaultValue;
		},
	};
}