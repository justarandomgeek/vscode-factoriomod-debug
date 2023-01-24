import { PropertyTree, PropertyTreeData, PropertyTreeType } from "./Util/PropertyTree";
import type { BufferStream } from "./Util/BufferStream";
import assert from "assert";

export class MapVersion {
	constructor(
		public readonly main:number,
		public readonly major:number,
		public readonly minor:number,
		public readonly patch:number,
		public readonly qual:boolean,
	) {}

	static load(b:BufferStream) {
		const main = b.readUInt16LE();
		const major = b.readUInt16LE();
		const minor = b.readUInt16LE();
		const patch = b.readUInt16LE();
		const qual = b.readUInt8() !== 0;
		return new MapVersion(main, major, minor, patch, qual);
	}

	save():Buffer {
		const b = Buffer.alloc(9);
		b.writeUInt16LE(this.main, 0);
		b.writeUInt16LE(this.major, 2);
		b.writeUInt16LE(this.minor, 4);
		b.writeUInt16LE(this.patch, 6);
		b.writeInt8(this.qual?1:0, 8);
		return b;
	}

	format() {
		return `${this.main}.${this.major}.${this.minor}-${this.patch}`;
	}

}

export type ModSettingsScopeName = "startup"|"runtime-global"|"runtime-per-user";
export type ModSettingsValue =
	{ type: "string"; value: string }|
	{ type: "number"; value: number }|
	{ type: "int"; value: bigint }|
	{ type: "bool"; value: boolean };
export type ModSettingsScope = {
	[k:string]: ModSettingsValue
};

export type ModSettingsData = {
	readonly [k in ModSettingsScopeName]: ModSettingsScope
};

export class ModSettings {
	readonly version: MapVersion;
	private readonly _settings: ModSettingsData;

	constructor(b:BufferStream) {
		this.version = MapVersion.load(b);
		const tree = PropertyTree.load(b);
		assert(tree.type===PropertyTreeType.dictionary);
		const loading:ModSettingsData = {
			["startup"]: {},
			["runtime-global"]: {},
			["runtime-per-user"]: {},
		};
		for (const scopename of ["startup", "runtime-global", "runtime-per-user"] as ModSettingsScopeName[]) {
			const treescope = tree.value[scopename];
			assert(treescope.type===PropertyTreeType.dictionary);
			const loadingscope:ModSettingsScope = loading[scopename];
			for (const key in treescope.value) {
				const wrapper = treescope.value[key];
				assert(wrapper.type===PropertyTreeType.dictionary);
				const element = wrapper.value["value"];
				switch (element.type) {
					case PropertyTreeType.string:
						loadingscope[key] = {
							type: "string",
							value: element.value,
						};
						break;
					case PropertyTreeType.number:
						loadingscope[key] = {
							type: "number",
							value: element.value,
						};
						break;
					case PropertyTreeType.signedinteger:
						loadingscope[key] = {
							type: "int",
							value: element.value,
						};
						break;
					case PropertyTreeType.bool:
						loadingscope[key] = {
							type: "bool",
							value: element.value,
						};
						break;

					default:
						throw new Error(`Unexpected type in ModSettings Tree: ${element.type}`);
				}
			}
		}
		this._settings = loading;
	}

	public get settings() : Readonly<ModSettingsData> {
		return this._settings;
	}

	save():Buffer {
		const tree:PropertyTreeData = {
			type: PropertyTreeType.dictionary,
			value: {},
		};
		for (const scopename of ["startup", "runtime-global", "runtime-per-user"] as ModSettingsScopeName[]) {
			const scope = this._settings[scopename];
			const treescope:PropertyTreeData = {
				type: PropertyTreeType.dictionary,
				value: {},
			};
			tree.value[scopename] = treescope;
			for (const key in scope) {
				const element = scope[key];
				switch (element.type) {
					case "string":
						treescope.value[key] = {
							type: PropertyTreeType.dictionary,
							value: {
								value: {
									type: PropertyTreeType.string,
									value: element.value,
								},
							},
						};
						break;
					case "bool":
						treescope.value[key] = {
							type: PropertyTreeType.dictionary,
							value: {
								value: {
									type: PropertyTreeType.bool,
									value: element.value,
								},
							},
						};
						break;
					case "int":
						treescope.value[key] = {
							type: PropertyTreeType.dictionary,
							value: {
								value: {
									type: PropertyTreeType.signedinteger,
									value: element.value,
								},
							},
						};
						break;
					case "number":
						treescope.value[key] = {
							type: PropertyTreeType.dictionary,
							value: {
								value: {
									type: PropertyTreeType.number,
									value: element.value,
								},
							},
						};
						break;

					default:
						break;
				}
			}
		}

		return Buffer.concat([
			this.version.save(),
			PropertyTree.save(tree),
		]);
	}

	set(type:ModSettingsScopeName, key:string, value?:ModSettingsValue) {
		if (value === undefined) {
			delete this._settings[type][key];
		} else {
			this._settings[type][key] = value;
		}
	}

	get(type:ModSettingsScopeName, key:string) : ModSettingsValue|undefined {
		return this._settings[type][key];
	}

	*list() {
		for (const scope in this._settings) {
			for (const setting in this._settings[scope as ModSettingsScopeName]) {
				const value = this._settings[scope as ModSettingsScopeName][setting];
				yield {
					scope: scope,
					setting: setting,
					value: value.value,
				};
			}
		}
	}
}

