
import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from "events";
import { BufferSplitter } from '../Util/BufferSplitter';
import * as path from 'path';
import treekill from 'tree-kill';

const stderrsplit = [Buffer.from("\n"), Buffer.from("lua_debug> ")];
const stdoutsplit = [Buffer.from("\n"),
	{
		start: Buffer.from([0xEF, 0xB7, 0xAE]), // U+FDEE
		end: Buffer.from([0xEF, 0xB7, 0xAF]), // U+FDEF
	}];

export class FactorioProcess extends EventEmitter {
	private readonly factorio: ChildProcess;
	private readonly hasNativeDebug?: boolean;

	constructor(factorioPath:string, factorioArgs:string[], nativeDebugger?:string, env?:NodeJS.ProcessEnv) {
		super();
		let spawnOptions: SpawnOptions = {
			cwd: path.dirname(factorioPath),
			// applying passed environment variables over parent environment
			env: Object.assign({}, process.env, env),
		};

		if (nativeDebugger) {
			this.hasNativeDebug = true;
			this.factorio = spawn(nativeDebugger, [factorioPath, ...factorioArgs], spawnOptions);
		} else {
			this.factorio = spawn(factorioPath, factorioArgs, spawnOptions);
		}
		this.factorio.on("exit", (...args:any[])=>this.emit("exit", ...args));

		const stderr = new BufferSplitter(this.factorio.stderr!, stderrsplit);
		stderr.on("segment", (chunk:Buffer)=>{
			if (chunk.length === 1 && chunk[0] === 0x0d ) { return; }
			this.emit("stderr", chunk);
		});
		const stdout = new BufferSplitter(this.factorio.stdout!, stdoutsplit);
		stdout.on("segment", (chunk:Buffer)=>{
			if (chunk.length === 1 && chunk[0] === 0x0d ) { return; }
			this.emit("stdout", chunk);
		});
	}

	public writeStdin(b:Buffer) {
		return this.factorio.stdin!.write(b);
	}

	public kill() {
		if (this.hasNativeDebug) {
			if (this.factorio.pid) {
				treekill(this.factorio.pid);
			}
		} else {
			this.factorio.kill();
			try {
				// this covers some weird hangs on closing on macs and
				// seems to have no ill effects on windows, but try/catch
				// just in case...
				this.factorio.kill('SIGKILL');
			} catch (error) {}
		}
	}
}