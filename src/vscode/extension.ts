import * as vscode from 'vscode';
import * as path from 'path';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioVersionSelector } from './VersionSelector';
import { FSProvider } from './FSProvider';
import * as LanguageClient from "../Language/Client";
import { ModSettingsEditorProvider } from '../ModSettings/ModSettingsEditorProvider';
import { ScriptDatEditorProvider } from '../ScriptDat/ScriptDatEditorProvider';

import { version } from "../../package.json";

export async function activate(context: vscode.ExtensionContext) {

	const output = vscode.window.createOutputChannel("FMTK", { log: true });

	output.info(`FMTK ${version}`);
	try {
		output.info(`Registering FS Provider...`);
		const fsprovider = new FSProvider();
		context.subscriptions.push(vscode.workspace.registerFileSystemProvider('fmtk', fsprovider, {isCaseSensitive: true}));

		output.info(`Registering Version Selector...`);
		const versionSelector = new FactorioVersionSelector(context, output, fsprovider);

		output.info(`Registering Native Debug Provider...`);
		const debug_provider = new FactorioDebugProvider(versionSelector);
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factorio', debug_provider));
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factorio', debug_provider));
		context.subscriptions.push(debug_provider);

		output.info(`Registering Language Client...`);
		LanguageClient.activate(context);

		output.info(`Registering Mod Package Provider...`);
		await activateModPackageProvider(context);

		output.info(`Registering Custom Editors...`);
		new ModSettingsEditorProvider(context);
		new ScriptDatEditorProvider(context);

		output.info(`Activate Complete`);
	} catch (error) {
		output.error(`Error while activating: ${error}`);
	}
}

class FactorioDebugProvider implements vscode.DebugConfigurationProvider, vscode.DebugAdapterDescriptorFactory {
	constructor(
		private readonly versionSelector: FactorioVersionSelector,
	) {
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

		if (!config.factorioArgs || !(config.factorioArgs as string[]).includes("--mod-directory")) {
			const modlists = await vscode.workspace.findFiles("**/mod-list.json");
			if (modlists.length === 1) {
				const dir = path.posix.normalize(path.resolve(vscode.Uri.joinPath(modlists[0], "..").fsPath));
				const def = await activeVersion.defaultModsPath();
				if (dir !== def) {
					config.factorioArgs = [ ...config.factorioArgs, "--mod-directory", dir];
				}
			} else if (modlists.length > 1) {
				throw new Error("Cannot automatically select mod directory, multiple mod-list.json in workspace");
			}
		}

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

		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStarting', false);
		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileStopping', false);
		await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', false);

		const config = vscode.workspace.getConfiguration("factorio.debug");

		const shim = config.get<string>("shim");
		if (shim) {
			return new vscode.DebugAdapterExecutable(shim, [activeVersion.factorioPath, "--dap"], {env: session.configuration.env});
		} else {
			return new vscode.DebugAdapterExecutable(activeVersion.factorioPath, [ "--dap"], {env: session.configuration.env});
		}
	}

	private readonly disposables:vscode.Disposable[] = [];
	dispose(): void {
		this.disposables.forEach(d=>d.dispose());
	}
}
