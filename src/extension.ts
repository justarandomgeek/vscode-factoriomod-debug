'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { FactorioModDebugSession } from './factorioModDebug';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
	const provider = new FactorioModConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

	// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
	let factory = new InlineDebugAdapterFactory();

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
	context.subscriptions.push(factory);
}

export function deactivate() {
	// nothing to do
}


class FactorioModConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		// factorio path exists and is a file (and is a binary?)
		if (!config.factorioPath || !fs.existsSync(config.factorioPath) ){
			return vscode.window.showInformationMessage("factorioPath is required").then(_ => {
				return undefined;	// abort launch
			});
		}

		// if data path is not set, assume factorio path dir/../../data, verify dir exists
		// except on macs, then it's only one layer...
		if (!config.dataPath){
			if (os.platform() == "darwin")
			{
				config.dataPath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../data" ));
			}
			else
			{
				config.dataPath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../../data" ));
			}
		}
		// if mods path is not set, assume factorio path dir/../../mods, verify dir exists
		// except on macs, it's not there.
		if (!config.modsPath && os.platform() != "darwin"){
			const modspath = path.posix.normalize(path.resolve(path.dirname(config.factorioPath), "../../mods" ));
			if (fs.existsSync(modspath))
			{
				config.modsPath = modspath;
			}
		}

		return config;
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		return new vscode.DebugAdapterInlineImplementation(new FactorioModDebugSession());
	}

	dispose()
	{

	}
}
