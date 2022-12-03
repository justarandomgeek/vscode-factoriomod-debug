import type { Readable } from 'stream';
import * as os from "os";
import * as fsp from 'fs/promises';
import * as semver from 'semver';
import * as crypto from "crypto";
import path from 'path';
import { createReadStream, createWriteStream } from "fs";
import { exec, spawn } from "child_process";
import { program } from 'commander';
import FormData from 'form-data';
import fetch, { Headers } from 'node-fetch';
import archiver from "archiver";

//@ts-ignore
import readdirGlob from 'readdir-glob';

import { URI, Utils } from 'vscode-uri';
import { applyEdits, Edit } from "jsonc-parser";
import * as jsonc from "jsonc-parser";

import type { ModInfo } from "../vscode/ModPackageProvider";
import { getConfig } from "./util";


async function getPackageinfo() {
	try {
		return JSON.parse(await fsp.readFile("info.json", "utf8")) as ModInfo;
	} catch (error) {
		console.log(`Failed to read info.json: ${error}`);
		process.exit(1);
	}

}

async function runPackageScript(scriptname:string, info:ModInfo, env?:{}) {
	return new Promise<number>(async (resolve, reject)=>{
		const script = info.package?.scripts?.[scriptname];
		if (script) {
			const proc = spawn(script, {
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

async function runPackageGitCommand(command:string, stdin?:string) {
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

async function doPackageDatestamp(info:ModInfo): Promise<boolean> {
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

async function doPackageZip(info:ModInfo): Promise<archiver.Archiver> {
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

interface PortalError {
	error:"InvalidApiKey"|"InvalidRequest"|"InternalError"|"Forbidden"|"Unknown"|"InvalidModRelease"|"InvalidModUpload"|"UnknownMod"
	message:string
}

async function doPackageUpload(packagestream:Readable|Buffer, name:string) {
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

async function doPackageVersion(info:ModInfo, json:string) {
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

program.command("run <script>")
	.description("Run a script from info.json#/package/scripts")
	.action(async (scriptname:string)=>{
		process.exit(await runPackageScript(scriptname, await getPackageinfo()));
	});

program.command("datestamp")
	.description("Datestamp the current changelog section")
	.action(async ()=>{
		const info = await getPackageinfo();
		await doPackageDatestamp(info);
	});

program.command("version")
	.description("Increment the mod version")
	.action(async ()=>{
		const json = await fsp.readFile("info.json", "utf8");
		const info = JSON.parse(json) as ModInfo;
		await doPackageVersion(info, json);
	});


program.command("package")
	.description("Build a zip package")
	.option("--outdir <outdir>", "", "")
	.action(async (options)=>{
		const info = await getPackageinfo();
		const zipuri = Utils.resolvePath(URI.file(process.cwd()), options.outdir, `${info.name}_${info.version}.zip`);
		const zipoutput = createWriteStream(zipuri.fsPath);
		const zip = await doPackageZip(info);
		zip.pipe(zipoutput);
		await zip.finalize();
		console.log(`Built ${info.name}_${info.version}.zip ${zip.pointer()} bytes`);
	});

program.command("upload <zipname> [name]")
	.description("Upload a zip package to the mod portal")
	.action(async (zipname:string, name?:string)=>{

		if (!name) {
			const basename = path.basename(zipname, ".zip");
			const match = basename.match(/^(.*?)(_(\d+\.){2}\d+)?$/);
			if (match) {
				name = match[1];
			}
		}

		if (!name) {
			console.log("Unable to determine `name`");
			return;
		}

		const packagezip = createReadStream(zipname);
		await doPackageUpload(packagezip, name);
	});

program.command("publish")
	.description("Package and publish a mod to the mod portal")
	.action(async ()=>{
		const json = await fsp.readFile("info.json", "utf8");
		const info = JSON.parse(json) as ModInfo;

		console.log(`Publishing: ${process.cwd()} ${info.version}`);

		//when launched from vscode, transfer config over, otherwise defaults
		const config:{
			preparingCommitMessage:string
			movedToCommitMessage:string
			autoCommitAuthor:string
			tagName: string
			tagMessage?: string
		} = await getConfig("package", {
			preparingCommitMessage: "preparing release of version $VERSION",
			movedToCommitMessage: "moved to version $VERSION",
			autoCommitAuthor: "compilatron <compilatron@justarandomgeek.com>",
			tagName: "$VERSION",
			tagMessage: undefined,
		});

		const repoStatus = await new Promise((resolve)=>{
			exec("git status --porcelain", (error, stdout, stderr)=>{
				if (error && error.code !== 0) {
					resolve(undefined); // no repo
				}
				if (stdout) {
					resolve("HasChanges");
				}
				resolve("OK");
			});
		});

		let branchname:string;
		if (repoStatus) {
			// throw if uncommitted changes
			if (repoStatus==="HasChanges") {
				console.log("Cannot Publish with uncommitted changes");
				return;
			}
			branchname = await new Promise((resolve, reject)=>{
				exec("git branch --show-current", (error, stdout)=>{
					if (error && error.code !== 0) {
						reject(error);
					}
					resolve(stdout.trim());
				});
			});
			let expectedBranch = info.package?.git_publish_branch;
			switch (expectedBranch) {
				case null:
					// null -> no check
					break;

				//@ts-expect-error fallthrough
				case undefined:
					// undefined -> check equal to `git config init.defaultBranch`
					expectedBranch = await new Promise((resolve, reject)=>{
						exec("git config init.defaultBranch", (error, stdout)=>{
							if (error && error.code !== 0) {
								reject(error);
							}
							resolve(stdout.trim());
						});
					});
				default:
					// string -> check equal to
					// throw if not on publish branch
					if (expectedBranch !== branchname) {
						console.log(`Cannot Publish on branch other than '${expectedBranch}', currently on '${branchname}'`);
						process.exit(1);
					}
					break;
			}
		} else {
			console.log("No git repo found, skipping git subtasks...");
		}

		if (info.package?.scripts?.prepublish) {
			const code = await runPackageScript("prepublish", info);
			if (code !== 0) {
				process.exit(code);
			}
		}

		const haschangelog = await doPackageDatestamp(info);

		let tagname:string|undefined;
		if (repoStatus) {
			if (haschangelog) { await runPackageGitCommand(`add changelog.txt`); }
			await runPackageGitCommand(
				`commit --author "${ config.autoCommitAuthor }" --allow-empty -F -`,
				config.preparingCommitMessage.replace(/\$VERSION/g, info.version).replace(/\$MODNAME/g, info.name));

			if (!info.package?.no_git_tag) {
				tagname = config.tagName.replace(/\$VERSION/g, info.version).replace(/\$MODNAME/g, info.name);
				const tagmessage = config.tagMessage?.replace(/\$VERSION/g, info.version).replace(/\$MODNAME/g, info.name);
				await runPackageGitCommand(`tag -a ${tagname} -F -`, tagmessage ?? "");
			}
		}

		// build zip with <factorio.package>
		const zipbuffer = await new Promise<Buffer>(async (resolve, reject)=>{
			const zip = await doPackageZip(info);
			const chunks:Buffer[] = [];
			zip.on('data', (chunk)=>chunks.push(Buffer.from(chunk)));
			zip.on('error', (err)=>reject(err));
			zip.on('end', ()=>resolve(Buffer.concat(chunks)));
			await zip.finalize();
		});

		if (info.package?.scripts?.publish) {
			const code = await runPackageScript("publish", info);
			if (code !== 0) {
				process.exit(code);
			}
		}

		if (!info.package?.no_portal_upload) {
			await doPackageUpload(zipbuffer, info.name);
		}

		if (info.package?.scripts?.postpublish) {
			const packagepath = path.join(os.tmpdir(), `${crypto.randomBytes(16).toString('base64url')}.zip`);
			await fsp.writeFile(packagepath, zipbuffer);
			const code = await runPackageScript("postpublish", info, {
				FACTORIO_MODPACKAGE: packagepath,
			});
			await fsp.unlink(packagepath);
			if (code !== 0) {
				process.exit(code);
			}
		}

		const newinfo = await doPackageVersion(info, json);
		if (repoStatus) {
			await runPackageGitCommand(`add info.json`);
			if (haschangelog) { await runPackageGitCommand(`add changelog.txt`); }
			await runPackageGitCommand(
				`commit --author "${ config.autoCommitAuthor }" -F -`,
				config.movedToCommitMessage.replace(/\$VERSION/g, newinfo.version).replace(/\$MODNAME/g, newinfo.name));

			if (!info.package?.no_git_push) {
				const upstream = await new Promise((resolve)=>{
					exec(`git config branch.${branchname}.remote`, (error, stdout)=>{
						if (error && error.code !== 0) {
							resolve(undefined);
						}
						resolve(stdout.trim());
					});
				});
				if (upstream) {
					await runPackageGitCommand(`push ${upstream} ${branchname!} ${tagname ?? ""}`);
				} else {
					console.log(`no remote set as upstream on ${branchname!}`);
				}
			}
		}
	});