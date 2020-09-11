import { DebugProtocol } from 'vscode-debugprotocol';
import * as vscode from 'vscode';

export interface ModEntry{
	name: string
	enabled: boolean
	version?: string
}
export interface ModList{
	mods: ModEntry[]
}

export interface ModInfo{
	name: string
    version: string
    factorio_version: string
    title: string
    author: string
    homepage: string
    contact: string
    description: string
    dependencies: string[]
}


export interface ModPaths{
	uri: vscode.Uri
	name: string
	version: string
	info: ModInfo
}

export type HookMode = "debug"|"profile";

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	factorioPath: string // path of factorio binary to launch
	nativeDebugger: string // path to native debugger if in use
	modsPath: string // path of `mods` directory
	modsPathDetected?: boolean
	configPath: string // path to config.ini
	configPathDetected?: boolean
	dataPath: string // path of `data` directory, always comes from config.ini
	manageMod?: boolean
	useInstrumentMode?: boolean
	factorioArgs?: Array<string>
	adjustMods?:{[key:string]:boolean|string}
	disableExtraMods?:boolean
	allowDisableBaseMod?:boolean
	hookSettings?:boolean
	hookData?:boolean
	hookControl?:string[]|boolean
	hookMode?:HookMode

	hookLog?:boolean
	keepOldLog?:boolean

	profileLines?:boolean
	profileFuncs?:boolean
	profileTree?:boolean
	profileSlowStart?: number
	profileUpdateRate?: number

	/** enable logging the Debug Adapter Protocol */
	trace?: boolean
}