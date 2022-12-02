'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as os from 'os';
import { FactorioModDebugSession } from './factorioModDebug';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioVersionSelector } from './VersionSelector';
import { ProfileRenderer } from './Profile/ProfileRenderer';
import * as LanguageClient from "./Language/Client";

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

		const args:string[] = config.factorioArgs;
		if (args) {
			if (args.includes("--config")) {
				vscode.window.showErrorMessage("Factorio --config option is set by configPath and should not be included in factorioArgs");
				return undefined;	// abort launch
			}
			if (args.includes("--mod-directory")) {
				vscode.window.showErrorMessage("Factorio --mod-directory option is set by modsPath and should not be included in factorioArgs");
				return undefined;	// abort launch
			}
		}

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

		if (config.modsPath) {
			config.modsPathSource = "launch";
			let modspath = path.posix.normalize(config.modsPath);
			if (modspath.match(/^~[\\\/]/)) {
				modspath = path.posix.join(
					os.homedir().replace(/\\/g, "/"),
					modspath.replace(/^~[\\\/]/, "") );
			}
			if (modspath.match(/[\\\/]$/)) {
				modspath = modspath.replace(/[\\\/]+$/, "");
			}
			try {
				await fsp.access(modspath);
				config.modsPath = modspath;
			} catch (error) {
				vscode.window.showInformationMessage("modsPath specified in launch configuration does not exist");
				return undefined;	// abort launch
			}
		} else {
			// modsPath not configured: detect from config.ini or mods-list.json in workspace
			const workspaceModLists = await vscode.workspace.findFiles("**/mod-list.json");

			if (workspaceModLists.length === 1) {
				// found one, just use it
				config.modsPath = path.dirname(workspaceModLists[0].fsPath);
				config.modsPathSource = "workspace";
			} else if (workspaceModLists.length > 1) {
				// found more than one. quickpick them.
				config.modsPath = await vscode.window.showQuickPick(
					workspaceModLists.map(ml=>path.dirname(ml.fsPath)),
					{
						placeHolder: "Select mod-list.json to use",
					}
				);
				if (!config.modsPath) { return undefined; }
				config.modsPathSource = "workspace";
			} else {
				// found none. detect from config.ini
				config.modsPathSource = "config";
				config.modsPath = await activeVersion.defaultModsPath();
			}
		}

		if (os.platform() === "win32" && config.modsPath.startsWith("/")) { config.modsPath = config.modsPath.substr(1); }

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
			//@ts-expect-error
			case "externalInspect":
				executable.args.unshift("--no-lazy", "--inspect-brk=34198");
				//fallthrough
			case "external":
				executable.args.push(...await activeVersion.debugLaunchArgs());
				return executable;
		}
	}

	dispose() {

	}
}

