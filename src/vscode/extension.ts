import * as vscode from 'vscode';
import { FactorioModDebugSession } from '../Debug/factorioModDebug';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioVersionSelector } from './VersionSelector';
import { FSProvider } from './FSProvider';
import { ProfileRenderer } from '../Profile/ProfileRenderer';
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

		output.info(`Registering Legacy Debug Provider...`);
		const legacy_provider = new FactorioModDebugProvider(versionSelector);
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', legacy_provider));
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', legacy_provider));
		context.subscriptions.push(legacy_provider);

		output.info(`Registering Native Debug Provider...`);
		const debug_provider = new FactorioDebugProvider(versionSelector);
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factorio', debug_provider));
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factorio', debug_provider));
		context.subscriptions.push(debug_provider);

		output.info(`Registering Language Client...`);
		LanguageClient.activate(context);

		output.info(`Registering Mod Package Provider...`);
		await activateModPackageProvider(context);

		output.info(`Registering Profile Renderer...`);
		new ProfileRenderer(context);

		output.info(`Registering Custom Editors...`);
		new ModSettingsEditorProvider(context);
		new ScriptDatEditorProvider(context);

		output.info(`Activate Complete`);
	} catch (error) {
		output.error(`Error while activating: ${error}`);
	}
}

// shiny new native, as "factorio"
class FactorioDebugProvider implements vscode.DebugConfigurationProvider, vscode.DebugAdapterDescriptorFactory {
	constructor(
		private readonly versionSelector: FactorioVersionSelector,
	) {
		this.disposables.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e)=>{
			if (e.session.type === "factorio") {
				switch (e.event) {
					case "profileRunning":
						await vscode.commands.executeCommand('setContext', 'factorio.debugProfileIsRunning', true);
						break;
					case "profileComplete":
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
					await session.customRequest("startProfile", {});
				}
			}));

		this.disposables.push(vscode.commands.registerCommand("factorio.stopProfile",
			async ()=>{
				const session = vscode.debug.activeDebugSession;
				if (session) {
					await session.customRequest("stopProfile", {});
				}
			}));
	}

	async resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration|undefined> {

		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }

		const debugconfigenv = vscode.workspace.getConfiguration("factorio.debug").get("env", {});
		if (Object.keys(debugconfigenv).length > 0) {
			config.env = Object.assign({}, debugconfigenv, config.env);
		}

		return config;
	}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable) {
		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }
		if (activeVersion.onlineOnly) {
			throw new Error("Select a local Factorio install to debug");
		}

		const config = vscode.workspace.getConfiguration("factorio.debug");

		const shim = config.get<string>("shim");
		if (shim) {
			return new vscode.DebugAdapterExecutable(shim, [activeVersion.factorioPath, "--dap"]);
		} else {
			return new vscode.DebugAdapterExecutable(activeVersion.factorioPath, [ "--dap"]);
		}
	}

	private readonly disposables:vscode.Disposable[] = [];
	dispose(): void {
		this.disposables.forEach(d=>d.dispose());
	}
}

// the old lua one, as "factoriomod"
class FactorioModDebugProvider implements vscode.DebugConfigurationProvider, vscode.DebugAdapterDescriptorFactory {
	constructor(
		private readonly versionSelector: FactorioVersionSelector,
	) {}

	async resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration|undefined> {

		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }

		if (await activeVersion.isPrototypeCacheEnabled()) {
			const pcache = await vscode.window.showWarningMessage(
				"Prototype Caching is enabled, which usually conflicts with the final portion of debugger initialization (which occurs in settings stage).",
				{ modal: true }, // modal to cut through Do Not Disturb, or else it looks like nothing is happening...
				"Disable in config.ini", "Continue anyway"
			);
			if (pcache === "Disable in config.ini") {
				await activeVersion.disablePrototypeCache();
			} else if (pcache === undefined) {
				return undefined;
			}
		}

		const debugconfigenv = vscode.workspace.getConfiguration("factorio.debug").get("env", {});
		if (Object.keys(debugconfigenv).length > 0) {
			config.env = Object.assign({}, debugconfigenv, config.env);
		}

		return config;
	}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable) {
		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }
		if (activeVersion.onlineOnly) {
			throw new Error("Select a local Factorio install to debug");
		}

		const config = vscode.workspace.getConfiguration("factorio");
		const runMode = config.get<string>("debug.runMode", "inline");
		switch (runMode) {
			case "inline":
			default:
				return new vscode.DebugAdapterInlineImplementation(
					new FactorioModDebugSession(
						activeVersion,
						vscode.workspace.fs,
						{
							findWorkspaceFiles: vscode.workspace.findFiles,
							getExtension: vscode.extensions.getExtension,
							executeCommand: vscode.commands.executeCommand,
						}
					));
			case "external":
				const inspect = config.get<boolean>("inspect", false);
				if (inspect) {
					executable.args.unshift("--nolazy", "--inspect-brk=34198");
				}
				executable.args.push(...await activeVersion.debugLaunchArgs());
				return executable;
		}
	}

	dispose() {}
}

