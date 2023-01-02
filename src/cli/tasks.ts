import type archiver from "archiver";
import type { Edit } from "jsonc-parser";
import * as fsp from 'fs/promises';
import mimer from "mimer";
import { default as fetch, Headers, FormData, Blob } from "node-fetch";

import type { ModInfo } from "../vscode/ModPackageProvider";
import type { ModCategory, ModLicense, ModPortalImage } from "../ModManager";
import inquirer from "inquirer";

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

let APIKey:string|undefined;
async function getAPIKey() {
	if (APIKey) { return APIKey; }

	const env = process.env["FACTORIO_UPLOAD_API_KEY"];
	if (env) {
		APIKey = env;
		return env;
	}

	const keytar = await import("keytar").then(m=>m.default).catch(()=>undefined);
	if (keytar) {
		const key = await keytar.getPassword("fmtk", "factorio-uploadmods");
		if (key) {
			APIKey = key;
			return key;
		}
	}

	const { key } = await inquirer.prompt<{key:string}>([{
		message: "Mod Portal API Key:",
		name: "key",
		type: "password",
	}]);

	if (key) {
		if (keytar) {
			keytar.setPassword("fmtk", "factorio-uploadmods", key);
		}
		APIKey = key;
		return key;
	}

	throw new Error("No API Key");
}

async function post_form<T extends {}>(form:FormData, url:string) {
	const APIKey = await getAPIKey();

	const result = await fetch(url, {
		method: "POST",
		body: form,
		headers: new Headers({"Authorization": `Bearer ${APIKey}`}),
	});
	if (!result.ok) {
		const error = await result.json() as PortalError;
		throw new Error(error.message);
	}
	return await result.json() as T;
}

async function init_upload(name:string, url:string) {
	const init_form = new FormData();
	init_form.append("mod", name);

	const result = await post_form(init_form, url) as {upload_url:string};
	return result.upload_url;
}

export async function addModRelease(name:string, packagestream:Buffer) {
	console.log(`Uploading to mod portal...`);

	const upload_url = await init_upload(name, "https://mods.factorio.com/api/v2/mods/releases/init_upload");

	const file_form = new FormData();
	file_form.append("file", new Blob([packagestream], {type: 'application/x-zip-compressed'}), `${name}.zip`,);
	await post_form(file_form, upload_url) as {success:true};
	console.log(`Published ${name}`);
	return;
}

export async function addModImage(name:string, image:Buffer, filename:string):Promise<ModPortalImage> {
	const upload_url = await init_upload(name, "https://mods.factorio.com/api/v2/mods/images/add");

	const image_form = new FormData();
	image_form.append("image", new Blob([image], {type: mimer(filename)}), filename);
	return await post_form(image_form, upload_url) as ModPortalImage;
}

export async function editModImages(name:string, images:string[]):Promise<ModPortalImage[]> {
	const form = new FormData();
	form.append("mod", name);
	form.append("images", images.join(","));

	const result = await post_form(
		form,
		"https://mods.factorio.com/api/v2/mods/images/edit"
	) as {success:true; images:ModPortalImage[]};

	return result.images;
}

export interface ModPortalDetailsEdit {
	deprecated?: boolean
	source_url?: string
	category?: ModCategory
	license?: ModLicense

	homepage?: string
	title?: string
	summary?: string

	description?: string // readme.md or arg
	faq?: string // faq.md or arg

}

export async function editModDetails(name:string, details:ModPortalDetailsEdit) {
	const form = new FormData();
	form.append("mod", name);
	details.homepage !== undefined && form.append("homepage", details.homepage);
	details.title !== undefined && form.append("title", details.title);
	details.summary !== undefined && form.append("summary", details.summary);
	details.description !== undefined && form.append("description", details.description);
	details.faq !== undefined && form.append("faq", details.faq);

	await post_form(form, "https://mods.factorio.com/api/v2/mods/edit_details") as {success:true};
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