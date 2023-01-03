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
	const configfile = process.env["FMTK_CONFIG_FILE"] ?? path.join(os.homedir(), ".fmtk", "config.json");
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

async function getConfigFromEnv<T extends {}>(section:string):Promise<Partial<T>|undefined> {
	const configenv = process.env["FMTK_CONFIG"];
	if (!configenv) { return undefined; }
	try {
		const config = JSON.parse(configenv);
		if (typeof config !== "object" || Array.isArray(config)) {
			return undefined;
		}
		const values = config[section];
		console.log(`Got config section ${section} from ENV:FMTK_CONFIG`);
		return values as Partial<T>;
	} catch (error) {}
	return undefined;
}

export async function getConfig<T extends {}>(section:string, defaults:T|PromiseLike<T>):Promise<T> {
	return Object.assign(
		{},
		...await Promise.all([
			defaults,
			getConfigFromFile<T>(section),
			getConfigFromEnv<T>(section),
		]),
	);
}