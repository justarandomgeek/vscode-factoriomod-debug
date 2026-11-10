import * as vscode from 'vscode';

export interface ModTaskTerminal {
	write(data: string): void
	close(): void
}

export class ModTaskPseudoterminal implements vscode.Pseudoterminal {
	private readonly writeEmitter = new vscode.EventEmitter<string>();
	onDidWrite: vscode.Event<string> = this.writeEmitter.event;
	private readonly closeEmitter = new vscode.EventEmitter<void>();
	onDidClose?: vscode.Event<void> = this.closeEmitter.event;
	private readonly tokensource = new vscode.CancellationTokenSource();

	private readonly runner: (term: ModTaskTerminal, token?: vscode.CancellationToken) => void | Promise<void>;

	constructor(runner: (term: ModTaskTerminal, token?: vscode.CancellationToken) => void | Promise<void>) {
		this.runner = runner;
	}

	open(initialDimensions: vscode.TerminalDimensions | undefined) {
		const writeEmitter = this.writeEmitter;
		const closeEmitter = this.closeEmitter;
		const result = this.runner({
			write: (data)=>writeEmitter.fire(data.replace(/\r?\n/g, "\r\n")),
			close: ()=>closeEmitter.fire(),
		}, this.tokensource.token);
		if (result) {
			void result.finally(()=>{
				closeEmitter.fire();
			});
		} else {
			closeEmitter.fire();
		}
	}

	close(): void {
		this.tokensource.cancel();
	}
}
