import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { FactorioVersionSelector } from './VersionSelector';

export class FactorioDebugProvider implements vscode.DebugConfigurationProvider, vscode.DebugAdapterDescriptorFactory {
	private readonly versionSelector: FactorioVersionSelector;
	constructor(versionSelector: FactorioVersionSelector) {
		this.versionSelector = versionSelector;
		this.disposables.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e)=>{
			if (e.session.type === "factorio") {
				switch (e.event) {
					case "profileRunning":
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', false);
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', false);
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', true);
						break;
					case "profileComplete":
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', false);
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', false);
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', false);
						await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(e.body.path));
						break;

					default:
						break;
				}
			}
		}));

		this.disposables.push(vscode.commands.registerCommand("factorio.startProfile",
			async ()=>{
				const session = vscode.debug.activeDebugSession;
				if (session) {
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', true);
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', false);
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', false);
					await session.customRequest("startProfile", {});
				}
			}));

		this.disposables.push(vscode.commands.registerCommand("factorio.stopProfile",
			async ()=>{
				const session = vscode.debug.activeDebugSession;
				if (session) {
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', false);
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', true);
					await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', true);
					await session.customRequest("stopProfile", {});
				}
			}));
	}

	async resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration|undefined> {

		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }

		const factorioArgs = (config.factorioArgs??[]) as string[];

		if (activeVersion.configPathIsOverriden()) {
			if (!factorioArgs.includes("-c") && !factorioArgs.includes("--config")) {
				factorioArgs.push( "--config", await activeVersion.configPath());
			}
		}

		if (!factorioArgs.includes("--mod-directory")) {
			const modlists = await vscode.workspace.findFiles("**/mod-list.json");
			if (modlists.length === 1) {
				const dir = path.posix.normalize(path.resolve(vscode.Uri.joinPath(modlists[0], "..").fsPath));
				const def = await activeVersion.defaultModsPath();
				if (dir !== def) {
					factorioArgs.push("--mod-directory", dir);
				}
			} else if (modlists.length > 1) {
				throw new Error("Cannot automatically select mod directory, multiple mod-list.json in workspace");
			}
		}

		config.factorioArgs = factorioArgs;

		const debugconfigenv = vscode.workspace.getConfiguration("factorio.debug").get("env", {});
		config.env = {...debugconfigenv, ...config.env, SteamAppId: "427520"};
		return config;
	}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable) {
		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }
		if (activeVersion.onlineOnly) {
			throw new Error("Cannot debug online docs. Select a local Factorio install to debug.");
		}

		const factorioArgs = (session.configuration.factorioArgs??[]) as string[];

		const configIndex = factorioArgs.findIndex(s=>(s==="-c"||s==="--config"));
		const configArgPath = configIndex === -1 ? undefined : factorioArgs[configIndex+1];

		let waited = 0;
		const lockpath = path.join(await activeVersion.writeDataPath(configArgPath), ".lock");
		while (fs.existsSync(lockpath)) {
			try {
				fs.rmSync(lockpath);
			} catch (error) {
				if (waited++ > 50) {
					throw new Error(`Factorio lock file (${lockpath}) still exists. Already running?`);
				}
				await new Promise((resolve)=>setTimeout(resolve, 100));
			}
		}

		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', false);
		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', false);
		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', false);

		const config = vscode.workspace.getConfiguration("factorio.debug");

		const shim = config.get<string>("shim");
		if (shim) {
			return new vscode.DebugAdapterExecutable(shim, [activeVersion.factorioPath, "--dap"], {env: session.configuration.env, cwd: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath});
		} else {
			return new vscode.DebugAdapterExecutable(activeVersion.factorioPath, [ "--dap"], {env: session.configuration.env, cwd: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath});
		}
	}

	private readonly disposables:vscode.Disposable[] = [];
	dispose(): void {
		this.disposables.forEach(d=>d.dispose());
	}
}
