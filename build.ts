import * as fsp from 'fs/promises';
import * as path from 'path';
import { build, BuildOptions, BuildResult, context, Plugin } from "esbuild";
import ImportGlobPlugin from 'esbuild-plugin-import-glob';

import { program } from 'commander';
import archiver from 'archiver';

import type { ModInfo } from './src/vscode/ModPackageProvider';

//@ts-ignore
import readdirGlob from 'readdir-glob';

function FactorioModPlugin():Plugin {
	return {
		name: 'factoriomod',
		setup(build) {
			build.onResolve({ filter: /^factoriomod:/ }, args=>{
				if (args.resolveDir === '') {
					return; // Ignore unresolvable paths
				}
				const apath = args.path.substring("factoriomod:".length);
				return {
					path: path.isAbsolute(apath) ? apath : path.join(args.resolveDir, apath),
					namespace: 'factoriomod',
				};
			});
			build.onLoad({ filter: /.*/, namespace: 'factoriomod' }, async (args)=>{
				const packagejsonPath = path.join(process.argv[1], "../package.json");
				const version = JSON.parse(await fsp.readFile(packagejsonPath, "utf8")).version;

				const archive = archiver('zip', { zlib: { level: 9 }});
				const templatePath = path.join(args.path, "info.template.json");
				const info = <ModInfo>JSON.parse(await fsp.readFile(templatePath, "utf8"));
				info.version = version;
				await fsp.writeFile(path.join(args.path, "info.json"), JSON.stringify(info));
				const files:string[] = [packagejsonPath, templatePath];
				const globber = readdirGlob(args.path, {pattern: '**', nodir: true, ignore: ["*.template.json"]});
				globber.on('match', (match:{ relative:string; absolute:string })=>{
					files.push(match.absolute);
					archive.file(match.absolute, { name: match.relative, prefix: `${info.name}_${info.version}` });
				});
				await new Promise<void>((resolve, reject)=>{
					globber.on('end', ()=>{
						resolve();
					});
					globber.on('error', (err:unknown)=>{
						reject(err);
					});
				});
				await archive.finalize();
				const zip = archive.read();
				return {
					contents: zip,
					loader: 'binary',
					watchDirs: [ args.path ],
					watchFiles: files,
				};
			});
		},
	};
}

class Watcher {
	private activeBuilds = 0;
	onStart() {
		if (this.activeBuilds++ === 0) {
			console.log("[watch] build started");
		}
	}

	onEnd(result:BuildResult) {
		result.errors.forEach((error)=>{
			console.error(`> ${error.location?.file}:${error.location?.line}:${error.location?.column}: error: ${error.text}`);
		});
		if (--this.activeBuilds === 0) {
			console.log("[watch] build finished");
		}
	}

	plugin():Plugin {
		const _this = this;
		return {
			name: 'watcher',
			setup(build) {
				build.onStart(()=>{ return _this.onStart(); });
				build.onEnd((result)=>{ return _this.onEnd(result); });
			},
		};
	}
}

const commonConfig:BuildOptions = {
	tsconfig: "./tsconfig.json",
	bundle: true,
	outdir: "dist",
	//logLevel: "info",
	sourcemap: true,
	sourcesContent: false,
};

const mainConfig:BuildOptions = {
	...commonConfig,
	entryPoints: {
		fmtk: "./src/fmtk.ts",
	},
	external: [
		"keytar",
		"vscode",
	],
	loader: {
		".html": "text",
		".lua": "text",
	},
	platform: "node",
	format: "cjs",
	// `module` first for jsonc-parser
	mainFields: ['module', 'main'],
	plugins: [
		ImportGlobPlugin(),
		FactorioModPlugin(),
	],
};

const webviewConfig:BuildOptions = {
	...commonConfig,
	entryPoints: {
		Flamegraph: "./src/Profile/Flamegraph.ts",
		ModSettingsWebview: "./src/ModSettings/ModSettingsWebview.ts",
		ScriptDatWebview: "./src/ScriptDat/ScriptDatWebview.ts",
	},
	external: [
		"vscode-webview",
	],
	loader: {
		".ttf": "copy",
	},
	platform: "browser",
	format: "esm",
	plugins: [
	],
};

program
	.option("--watch")
	.option("--meta")
	.option("--minify")
	.action(async (options:{watch?:boolean; meta?:boolean; minify?:boolean})=>{
		if (options.watch) {
			const watcher = new Watcher();
			mainConfig.plugins!.push(watcher.plugin());
			webviewConfig.plugins!.push(watcher.plugin());
		}
		const optionsConfig:BuildOptions = {
			metafile: options.meta,
			minify: options.minify,
		};

		if (options.watch) {
			const contexts = await Promise.all([
				context({
					...mainConfig,
					...optionsConfig,
				}),
				context({
					...webviewConfig,
					...optionsConfig,
				}),
			]);
			await Promise.all(contexts.map(c=>c.watch()));
		} else {
			const result = await Promise.all([
				build({
					...mainConfig,
					...optionsConfig,
				}),
				build({
					...webviewConfig,
					...optionsConfig,
				}),
			]);
			if (options.meta) {
				await Promise.all(result.map((result, i)=>fsp.writeFile(`./out/meta_${i}.json`, JSON.stringify(result.metafile))));
			}
		}
	}).parseAsync();