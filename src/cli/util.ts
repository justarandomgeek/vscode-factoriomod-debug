import * as os from 'os';
import * as fsp from 'fs/promises';

import type { FileSystem, FileType } from 'vscode';
import type { URI } from 'vscode-uri';
import path from 'path';

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

async function getConfigFromFile<T extends {}>(section:string):Promise<Partial<T>|undefined> {
	const configfile = process.env["FMTK_CONFIG"] ?? path.join(os.homedir(), ".fmtk", "config.json");
	try {
		const config = JSON.parse(await fsp.readFile(configfile, "utf8"));
		if (typeof config !== "object" || Array.isArray(config)) {
			return undefined;
		}
		const values:{[s:string]:any} = {};
		for (const key in config) {
			if (key.startsWith(`${section}.`)) {
				values[key.substring(section.length+1)] = config[key];
			}
		}
		console.log(`Got config section ${section} from ${configfile}`);
		return values as Partial<T>;
	} catch (error) {}
	return undefined;
}

async function getConfigFromIPC<T extends {}>(section:string):Promise<Partial<T>|undefined> {
	if (!process.send) { return undefined; }
	const p = new Promise<Partial<T>>((resolve)=>{
		const gotconfig = (msg:{cmd:string;section:string;config:Partial<T>})=>{
			if (msg.cmd === "config" && msg.section === section) {
				console.log(`Got config section ${section} from VSCode`);
				resolve(msg.config);
			}
			process.off("message", gotconfig);
		};
		process.on("message", gotconfig);
	});
	process.send({cmd: "getConfig", section: section});
	return p;
}

export async function getConfig<T extends {}>(section:string, defaults:T|PromiseLike<T>):Promise<T> {
	return Object.assign(
		{},
		...await Promise.all([
			defaults,
			getConfigFromFile<T>(section),
			getConfigFromIPC<T>(section),
		]),
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