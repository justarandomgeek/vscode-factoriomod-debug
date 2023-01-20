import { fork, ForkOptions } from "child_process";

export interface ForkResult {
	stdout: Buffer
	stderr: Buffer
}

export interface ForkErrorResult extends ForkResult {
	code?: number
	signal?: NodeJS.Signals
}

export async function forkTest(modulePath:string, args:readonly string[], options?:ForkOptions):Promise<ForkResult> {
	const proc = fork(modulePath, args, Object.assign({}, options, {stdio: "pipe"} as ForkOptions));
	proc.stdin?.end();
	return new Promise((resolve, reject)=>{
		proc.on('exit', (code, signal)=>{
			const stdout = proc.stdout?.read();
			const stderr = proc.stderr?.read();
			if (code === 0) {
				resolve({
					stdout: stdout,
					stderr: stderr,
				} as ForkResult);
			} else  {
				reject({
					stdout: stdout,
					stderr: stderr,
					code: code,
					signal: signal,
				} as ForkErrorResult);
			}
		});
	});
}
