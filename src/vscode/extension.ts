'use strict';
import * as vscode from 'vscode';
import { FactorioModDebugSession } from '../Debug/factorioModDebug';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioVersionSelector } from './VersionSelector';
import { ProfileRenderer } from '../Profile/ProfileRenderer';
import * as LanguageClient from "../Language/Client";
import inspector from 'inspector';
import { ModSettingsEditorProvider } from './ModSettingsEditorProvider';

export function activate(context: vscode.ExtensionContext) {
	const versionSelector = new FactorioVersionSelector(context);

	const provider = new FactorioModConfigurationProvider(versionSelector);
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

	const factory = new DebugAdapterFactory(versionSelector);

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
	context.subscriptions.push(factory);

	LanguageClient.activate(context);

	activateModPackageProvider(context);

	new ProfileRenderer(context);
	new ModSettingsEditorProvider(context);
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

		const runMode = vscode.workspace.getConfiguration("factorio.debug").get<string>("runMode", "inline");
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
				if (!!inspector.url()) {
					executable.args.unshift("--nolazy", "--inspect-brk=34198");
				}
				executable.args.push(...await activeVersion.debugLaunchArgs());
				return executable;
		}
	}

	dispose() {

	}
}

