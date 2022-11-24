import * as fsp from 'fs/promises';
import * as path from 'path';
import { build, analyzeMetafile } from "esbuild";
import ImportGlobPlugin from 'esbuild-plugin-import-glob';

import { program } from 'commander';
import archiver from 'archiver';

import type { ModInfo } from './src/ModPackageProvider';
import { version } from './package.json';

//@ts-ignore
import readdirGlob from 'readdir-glob';

program
	.option("--map")
	.option("--watch")
	.option("--meta")
	.option("--minify")
	.option("--analyze")
	.action(async (options:{map?:boolean; watch?:boolean; meta?:boolean; minify?:boolean; analyze?:boolean})=>{
		const result = await build({
			tsconfig: "./tsconfig.json",
			entryPoints: {
				extension: "./src/extension.ts",
				standalone: "./src/standalone.ts",
				Flamegraph: "./src/Profile/Flamegraph.ts",
			},
			external: [
				"vscode",
				"vscode-webview",
				"./standalone",
			],
			loader: {
				".html": "text",
				".lua": "text",
			},
			platform: "node",
			// `module` first for jsonc-parser
			mainFields: ['module', 'main'],
			bundle: true,
			format: "cjs",
			outdir: "dist",
			logLevel: "info",
			watch: options.watch,
			sourcemap: options.map,
			sourcesContent: false,
			metafile: options.meta || options.analyze,
			minify: options.minify,
			plugins: [
				ImportGlobPlugin(),
				{
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
							const archive = archiver('zip', { zlib: { level: 9 }});
							const templatePath = path.join(args.path, "info.template.json");
							const info = <ModInfo>JSON.parse(await fsp.readFile(templatePath, "utf8"));
							info.version = version;
							await fsp.writeFile(path.join(args.path, "info.json"), JSON.stringify(info));
							const files:string[] = [templatePath];
							const globber = readdirGlob(args.path, {pattern: '**', nodir: true, ignore: ["*.template.json"]});
							globber.on('match', (match:{ relative:string; absolute:string })=>{
								files.push(match.absolute);
								archive.file(match.absolute, { name: match.relative, prefix: `${info.name}_${info.version}` });
							});
							globber.on('error', (err:unknown)=>{
								throw err;
							});
							await new Promise<void>((resolve)=>{
								globber.on('end', ()=>{
									resolve();
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
				},
			],
		}).catch(()=>process.exit(1));
		if (options.meta) {
			await fsp.writeFile('./out/meta.json', JSON.stringify(result.metafile));
		}
		if (options.analyze) {
			console.log(await analyzeMetafile(result.metafile!, { color: true, verbose: true }));
		}
	}).parseAsync();