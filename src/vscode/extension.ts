import * as vscode from 'vscode';
import { activateModPackageProvider } from './ModPackageProvider';
import { FactorioDebugProvider } from "./FactorioDebugProvider";
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