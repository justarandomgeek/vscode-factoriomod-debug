import * as fsp from 'fs/promises';
import * as path from 'path';
import type { BuildOptions, BuildResult, Metafile, Plugin } from "esbuild";
import { build, context } from "esbuild";

import {default as ImportGlob} from 'esbuild-plugin-import-glob';
//@ts-expect-error this plugin's exports are broken...
const ImportGlobPlugin = ImportGlob.default as typeof ImportGlob;

import { program } from 'commander';
import archiver from 'archiver';

import type { ModInfo } from './src/vscode/ModPackageProvider';

import { readdirGlob } from 'readdir-glob';

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
				const info = JSON.parse(await fsp.readFile(templatePath, "utf8")) as ModInfo;
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
					globber.on('error', (err)=>{
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
		return {
			name: 'watcher',
			setup: (build)=>{
				build.onStart(()=>{ this.onStart(); });
				build.onEnd((result)=>{ this.onEnd(result); });
			},
		};
	}
}

const commonConfig:BuildOptions = {
	tsconfig: "./tsconfig.json",
	bundle: true,
	outdir: "dist",
	sourcemap: true,
	sourcesContent: false,
	platform: "node",
	format: "esm",
	treeShaking: true,
	// `module` first for jsonc-parser
	mainFields: ['module', 'main'],
	loader: {
		".html": "text",
		".lua": "text",
		".ttf": "copy",
	},
	plugins: [
	],
};

const configs:BuildOptions[] = [
	{
		...commonConfig,
		entryPoints: {
			"fmtk-cli": "./src/cli/main.ts",
			"fmtk-vscode": "./src/vscode/extension.ts",
		},
		splitting: true,
		external: [
			// vscode isn't a real import, it's a special hook
			"vscode",
		],
		banner: {
			// https://github.com/evanw/esbuild/issues/1232#issuecomment-830677608
			// shim `require` for cjs deps to load properly in esm-land
			js: `
			import {createRequire} from 'module'
			const require = createRequire(import.meta.url)
			`,
		},
		plugins: [
			ImportGlobPlugin(),
			FactorioModPlugin(),
		],
	},
	{
		...commonConfig,
		platform: "browser",
		entryPoints: {
			Flamegraph: "./src/Profile/Flamegraph.ts",
			ModSettingsWebview: "./src/ModSettings/ModSettingsWebview.ts",
			ScriptDatWebview: "./src/ScriptDat/ScriptDatWebview.ts",
		},
		external: [
			"vscode-webview",
		],
	},
];

await program
	.option("--watch")
	.option("--meta")
	.option("--minify")
	.action(async (options:{watch?:boolean; meta?:boolean; minify?:boolean})=>{
		if (options.watch) {
			const watcher = new Watcher();
			configs.forEach(config=>config.plugins!.push(watcher.plugin()));
		}
		const optionsConfig:BuildOptions = {
			metafile: options.meta,
			minify: options.minify,
		};

		if (options.watch) {
			const contexts = await Promise.all(
				configs.map(config=>context({
					...config,
					...optionsConfig,
				})));
			await Promise.all(contexts.map(c=>c.watch()));
		} else {
			const result = await Promise.all(configs.map(config=>build({
				...config,
				...optionsConfig,
			})));
			if (options.meta) {
				const metas = result.map(result=>result.metafile).filter(m=>!!m);
				const merged:Metafile = {
					inputs: {},
					outputs: {},
				};

				for (const meta of metas) {
					for (const key in meta.inputs) {
						if (Object.prototype.hasOwnProperty.call(meta.inputs, key)) {
							const input = meta.inputs[key];
							if (merged.inputs[key]) {
								merged.inputs[key].imports = merged.inputs[key].imports.concat(input.imports);
							} else {
								merged.inputs[key] = input;
							}
						}
					}

					for (const key in meta.outputs) {
						if (Object.prototype.hasOwnProperty.call(meta.outputs, key)) {
							const output = meta.outputs[key];
							if (merged.outputs[key]) {
								throw new Error("Duplicate Outputs");
							} else {
								merged.outputs[key] = output;
							}
						}
					}
				}

				await fsp.writeFile(`./out/meta.json`, JSON.stringify(merged));
			}
		}
	}).parseAsync();