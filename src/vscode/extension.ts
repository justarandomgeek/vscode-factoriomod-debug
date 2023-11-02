'use strict';
import * as vscode from 'vscode';
import { FactorioModDebugSession } from '../Debug/factorioModDebug';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioVersionSelector } from './VersionSelector';
import { ProfileRenderer } from '../Profile/ProfileRenderer';
import * as LanguageClient from "../Language/Client";
import { ModSettingsEditorProvider } from '../ModSettings/ModSettingsEditorProvider';
import { ScriptDatEditorProvider } from '../ScriptDat/ScritpDatEditorProvider';

import { version } from "../../package.json";

export function activate(context: vscode.ExtensionContext) {

	const output = vscode.window.createOutputChannel("FMTK", { log: true });

	output.info(`FMTK ${version}`);
	try {
		output.info(`Registering Version Selector...`);
		const versionSelector = new FactorioVersionSelector(context, output);

		output.info(`Registering Debug Provider...`);
		const provider = new FactorioModConfigurationProvider(versionSelector);
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

		const factory = new DebugAdapterFactory(versionSelector);
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
		context.subscriptions.push(factory);

		output.info(`Registering Language Client...`);
		LanguageClient.activate(context);

		output.info(`Registering Mod Package Provider...`);
		activateModPackageProvider(context);

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

class FactorioModConfigurationProvider implements vscode.DebugConfigurationProvider {
	constructor(
		private readonly versionSelector: FactorioVersionSelector,
	) {

	}

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	async resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration|undefined> {

		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }

		await activeVersion.checkSteamAppID(vscode.window);

		if (await activeVersion.isPrototypeCacheEnabled()) {
			const pcache = await vscode.window.showWarningMessage(
				"Prototype Caching is enabled, which usually conflicts with the final portion of debugger initialization (which occurs in settings stage).",
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
}

class DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
	constructor(
		private readonly versionSelector: FactorioVersionSelector,
	) {}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable) {
		const activeVersion = await this.versionSelector.getActiveVersion();
		if (!activeVersion) { return; }

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

	dispose() {

	}
}

