import type { Readable } from 'stream';
import type archiver from "archiver";
import type { Edit } from "jsonc-parser";
import * as fsp from 'fs/promises';

import type { ModInfo } from "../vscode/ModPackageProvider";

export async function getPackageinfo() {
	try {
		return JSON.parse(await fsp.readFile("info.json", "utf8")) as ModInfo;
	} catch (error) {
		console.log(`Failed to read info.json: ${error}`);
		process.exit(1);
	}
}

export async function runPackageScript(scriptname:string, info:ModInfo, env?:{}, args?:string[]) {
	const { spawn } = await import("child_process");
	return new Promise<number>(async (resolve, reject)=>{
		const script = info.package?.scripts?.[scriptname];
		if (script) {
			const proc = spawn(`${script} ${(args??[]).join(" ")}`, {
				shell: true,
				windowsHide: true,
				stdio: "inherit",
				env: Object.assign({}, process.env, {
					FACTORIO_MODNAME: info.name,
					FACTORIO_MODVERSION: info.version,
					// if windows users use wsl bash, pass our env through to there too...
					WSLENV: (process.env.WSLENV?process.env.WSLENV+":":"") + "FACTORIO_MODNAME/u:FACTORIO_MODVERSION/u:FACTORIO_MODPACKAGE/p",
				}, env),
			});
			proc.on('error', reject);
			proc.on("close", (code, signal)=>{
				if (code !== null) {
					resolve(code);
				} else {
					reject(signal);
				}
			});
		} else {
			reject(new Error(`No script '${scriptname}'`));
		}
	});
}

export async function runPackageGitCommand(command:string, stdin?:string) {
	const { spawn } = await import("child_process");
	return new Promise<void>(async (resolve, reject)=>{
		const proc = spawn(`git ${command}`, {
			shell: true,
			windowsHide: true,
			stdio:
				stdin !== undefined ? ["pipe", 'inherit', 'inherit'] :
				"inherit",
		});
		if (stdin !== undefined && proc.stdin) {
			proc.stdin.write(stdin);
			proc.stdin.end();
		}
		proc.on('error', reject);
		proc.on("close", (code, signal)=>{
			if (code === 0) {
				resolve();
			} else if (code !== null) {
				reject(code);
			} else {
				reject(signal);
			}
		});
	});
}

export async function doPackageDatestamp(info:ModInfo): Promise<boolean> {
	const { URI, Utils } = await import('vscode-uri');
	const jsoncparser = await import("jsonc-parser");
	const { applyEdits } = jsoncparser;
	const uri = Utils.joinPath(URI.file(process.cwd()), "changelog.txt");
	let content:string|undefined;
	try {
		content = await fsp.readFile("changelog.txt", "utf8");
	} catch (error) {}
	if (!content) {
		console.log("No changelog.txt");
	} else {
		const { TextDocument } = await import("vscode-languageserver-textdocument");
		const { ChangeLogLanguageService } = await import("../Language/ChangeLog");
		const doc = TextDocument.create(uri.toString(), "factorio-changelog", 1, content);
		const langserv = new ChangeLogLanguageService();
		const syms = langserv.onDocumentSymbol(doc);

		const current = syms?.find(sym=>sym.name.startsWith(info.version))!;
		if (current) {
			const date = current.children?.find(sym=>sym.name === "Date");
			let edit:Edit;
			if (date) {
				edit = {
					content: new Date().toISOString().substr(0, 10),
					offset: doc.offsetAt(date.selectionRange.start),
					length: date.selectionRange.end.character - date.selectionRange.start.character,
				};
			} else {
				edit = {
					content: `\nDate: ${new Date().toISOString().substr(0, 10)}`,
					offset: doc.offsetAt(current.selectionRange.end),
					length: 0,
				};
			}
			content = applyEdits(content, [edit]);
			fsp.writeFile("changelog.txt", content);
			console.log(`Changelog section ${info.version} stamped ${new Date().toISOString().substr(0, 10)}`);
		} else {
			console.log(`No Changelog section for ${info.version}`);
		}
	}

	if (info.package?.scripts?.datestamp) {
		const code = await runPackageScript("datestamp", info);
		if (code !== 0) {
			process.exit(code);
		}
	}
	return !!content;
}

export async function doPackageZip(info:ModInfo): Promise<archiver.Archiver> {
	if (info.package?.scripts?.compile) {
		const code = await runPackageScript("compile", info);
		if (code !== 0) {
			process.exit(code);
		}
	}

	if (info.package?.scripts?.prepackage) {
		const code = await runPackageScript("prepackage", info);
		if (code !== 0) {
			process.exit(code);
		}
	}

	const archiver = (await import("archiver")).default;
	const archive = archiver('zip', { zlib: { level: 9 }});
	archive.glob("**", {
		cwd: process.cwd(),
		root: process.cwd(),
		nodir: true,
		ignore: [`**/${info.name}_*.zip`].concat(info.package?.ignore||[]),
	}, { prefix: `${info.name}_${info.version}` });

	if (info.package?.extra) {
		for (const extra of info.package.extra) {
			archive.glob(extra.glob ?? "**", {
				cwd: extra.root,
				root: extra.root,
				nodir: true,
				ignore: extra.ignore,
			}, { prefix: `${info.name}_${info.version}` });
		}
	}

	return archive;
}

export interface PortalError {
	error:"InvalidApiKey"|"InvalidRequest"|"InternalError"|"Forbidden"|"Unknown"|"InvalidModRelease"|"InvalidModUpload"|"UnknownMod"
	message:string
}

export async function doPackageUpload(packagestream:Readable|Buffer, name:string) {
	const FormData = (await import("form-data")).default;
	const nodefetch = await import("node-fetch");
	const fetch = nodefetch.default;
	const { Headers } = nodefetch;
	const APIKey = process.env["FACTORIO_UPLOAD_API_KEY"];

	if (!APIKey) { throw new Error("No API Key"); }

	const headers = new Headers({
		"Authorization": `Bearer ${APIKey}`,
	});
	console.log(`Uploading to mod portal...`);
	const init_form = new FormData();
	init_form.append("mod", name);
	const init_result = await fetch("https://mods.factorio.com/api/v2/mods/releases/init_upload", {
		method: "POST",
		body: init_form,
		headers: headers,
	});
	if (!init_result.ok) {
		console.log(`init_upload failed: ${init_result.status} ${init_result.statusText}'`);
		throw new Error(init_result.statusText);
	}
	const init_json = <{upload_url:string}|PortalError> await init_result.json();

	if ('error' in init_json) {
		console.log(`init_upload failed: ${init_json.error} ${init_json.message}'`);
		throw new Error(init_json.error);
	}

	const finish_form = new FormData();
	finish_form.append(
		"file",
		packagestream,
		{
			filename: `${name}.zip`,
			contentType: 'application/x-zip-compressed',
		});
	const finish_result = await fetch(init_json.upload_url, {
		method: "POST",
		body: finish_form,
		headers: headers,
	});
	if (!finish_result.ok) {
		console.log(`finish_upload failed: ${finish_result.status} ${finish_result.statusText}'`);
		throw new Error(finish_result.statusText);
	}
	const finish_json = <{success:true}|PortalError> await finish_result.json();
	if ('error' in finish_json) {
		console.log(`finish_upload failed: ${finish_json.error} ${finish_json.message}'`);
		throw new Error(finish_json.error);
	}
	console.log(`Published ${name}`);
	return;
}

export async function doPackageVersion(info:ModInfo, json:string) {
	const semver = (await import('semver')).default;
	const jsonc = await import("jsonc-parser");
	const { applyEdits } = jsonc;
	const newversion = semver.inc(info.version, 'patch', {"loose": true})!;
	const edits = jsonc.modify(json, ["version"], newversion, {});
	await fsp.writeFile("info.json", applyEdits(json, edits));
	info.version = newversion;

	await fsp.readFile("changelog.txt", "utf8")
		.catch(()=>undefined)
		.then(async (changelog)=>{
			if (changelog) {
				const useCR = changelog.indexOf("\r\n")!==-1;
				const n = useCR ? "\r\n" : "\n";
				await fsp.writeFile("changelog.txt",
					`---------------------------------------------------------------------------------------------------${n}` +
					`Version: ${newversion}${n}` +
					`Date: ????${n}` +
					`  Changes:${n}` +
					changelog);
			}
		});

	if (info.package?.scripts?.version) {
		const code = await runPackageScript("version", info);
		if (code !== 0) {
			process.exit(code);
		}
	}
	return info;
}