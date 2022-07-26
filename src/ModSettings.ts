import { PropertyTree } from "./PropetyTree";
import { BufferStream } from "./BufferStream";

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

}

type ModSettingsScope = "startup"|"runtime-global"|"runtime-per-user";
type ModSettingsType = string|number|boolean;
type ModSettingsData = {
	readonly [k in ModSettingsScope]: {
		[k:string]: {
			["value"]: ModSettingsType
		}
	}
};

export class ModSettings {
	readonly version: MapVersion;
	private readonly settings: ModSettingsData;

	constructor(b:BufferStream|Buffer) {
		if (b instanceof Buffer) { b = new BufferStream(b); }
		this.version = MapVersion.load(b);
		this.settings = <ModSettingsData>PropertyTree.load(b);
	}

	save():Buffer {
		return Buffer.concat([
			this.version.save(),
			PropertyTree.save(this.settings),
		]);
	}

	set(type:ModSettingsScope, key:string, value?:ModSettingsType) {
		if (value === undefined) {
			delete this.settings[type][key];
		} else {
			this.settings[type][key] = {"value": value};
		}
	}

	get(type:ModSettingsScope, key:string) : ModSettingsType|undefined {
		return this.settings[type][key]?.value;
	}

	*list() {
		for (const scope in this.settings) {
			for (const setting in this.settings[scope as ModSettingsScope]) {
				const value = this.settings[scope as ModSettingsScope][setting];
				yield {
					scope: scope,
					setting: setting,
					value: value.value,
				};
			}
		}
	}
}

