import * as os from "os";
import * as fsp from 'fs/promises';
import * as crypto from "crypto";
import path from 'path';
import { exec } from "child_process";
import { program } from 'commander';
import type { ModInfo } from "../vscode/ModPackageProvider";
import { getConfig } from "./util";

import { runPackageScript, doPackageDatestamp, addModRelease, doPackageVersion, doPackageZip, runPackageGitCommand, doPackageDetails  } from "./tasks";

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
			await addModRelease(info.name, zipbuffer);
			if (!info.package?.no_portal_details) {
				await doPackageDetails(info);
			}
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