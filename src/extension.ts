/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { MockDebugSession } from './mockDebug';

export function activate(context: vscode.ExtensionContext) {
	// register a configuration provider for 'mock' debug type
	const provider = new MockConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('factoriomod', provider));

	// debug adapters can be run in different ways by using a vscode.DebugAdapterDescriptorFactory:
	let factory = new InlineDebugAdapterFactory();

	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('factoriomod', factory));
	context.subscriptions.push(factory);
}

export function deactivate() {
	// nothing to do
}


class MockConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		//TODO: validate config has a factorio path to launch
		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'lua') {
				config.type = 'factoriomod';
				config.name = 'Launch';
				config.request = 'launch';
			}
		}

		//if (!config.program) {
		//	return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
		//		return undefined;	// abort launch
		//	});
		//}

		return config;
	}
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(_session: vscode.DebugSession): ProviderResult<vscode.DebugAdapterDescriptor> {
		// since DebugAdapterInlineImplementation is proposed API, a cast to <any> is required for now
		return <any> new vscode.DebugAdapterInlineImplementation(<any> new MockDebugSession());
	}

	dispose()
	{

	}
}
