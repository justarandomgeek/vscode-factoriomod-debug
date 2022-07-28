import * as fsp from 'fs/promises';
import * as path from 'path';
import { build } from "esbuild";
import { program } from 'commander';
import archiver from 'archiver';
import { ModInfo } from './src/ModPackageProvider';
import { version } from './package.json';

//@ts-ignore
import readdirGlob from 'readdir-glob';

program
	.option("--map")
	.option("--watch")
	.option("--meta")
	.option("--minify")
	.action(async ()=>{
		const opts = program.opts();
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
			],
			loader: {
				".html": "text",
				".zip": "binary",
			},
			platform: "node",
			bundle: true,
			format: "cjs",
			outdir: "dist",
			logLevel: "info",
			watch: opts.watch,
			sourcemap: opts.map,
			sourcesContent: false,
			metafile: opts.meta,
			minify: opts.minify,
			plugins: [
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
							const info = <ModInfo>JSON.parse(await fsp.readFile(path.join(args.path, "info.json"), "utf8"));
							info.version = version;
							archive.append(JSON.stringify(info), { name: "info.json", prefix: `${info.name}_${info.version}` });
							const files:string[] = [];
							const globber = readdirGlob(args.path, {pattern: '**', nodir: true, ignore: ["info.json"]});
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
		if (opts.meta) {
			await fsp.writeFile('./out/meta.json', JSON.stringify(result.metafile));
		}
	}).parseAsync();