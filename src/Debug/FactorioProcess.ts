
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from "events";
import { BufferSplitter } from '../Util/BufferSplitter';
import * as path from 'path';
import treekill from 'tree-kill';

const stderrsplit = [Buffer.from("\n"), Buffer.from("lua_debug> ")];
const stdoutsplit = [Buffer.from("\n"), {
	start: Buffer.from("***DebugAdapterBlockPrint***"),
	end: Buffer.from("***EndDebugAdapterBlockPrint***")}];

export class FactorioProcess extends EventEmitter {
	private readonly factorio: ChildProcess;
	private readonly hasNativeDebug?: boolean;

	constructor(factorioPath:string, factorioArgs:string[], nativeDebugger?:string) {
		super();
		if (nativeDebugger) {
			this.hasNativeDebug = true;
			this.factorio = spawn(nativeDebugger, [factorioPath, ...factorioArgs], {
				cwd: path.dirname(factorioPath),
			});
		} else {
			this.factorio = spawn(factorioPath, factorioArgs, {
				cwd: path.dirname(factorioPath),
			});
		}
		this.factorio.on("exit", (...args:any[])=>this.emit("exit", ...args));

		const stderr = new BufferSplitter(this.factorio.stderr!, stderrsplit);
		stderr.on("segment", (chunk:Buffer)=>{
			let chunkstr : string = chunk.toString();
			chunkstr = chunkstr.replace(/^[\r\n]*/, "").replace(/[\r\n]*$/, "");
			if (!chunkstr) { return; }
			this.emit("stderr", chunkstr);
		});
		const stdout = new BufferSplitter(this.factorio.stdout!, stdoutsplit);
		stdout.on("segment", async (chunk:Buffer)=>{
			let chunkstr:string = chunk.toString();
			chunkstr = chunkstr.replace(/^[\r\n]*/, "").replace(/[\r\n]*$/, "");
			if (!chunkstr) { return; }
			this.emit("stdout", chunkstr);
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