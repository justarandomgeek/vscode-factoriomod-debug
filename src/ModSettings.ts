import { ConsumingBuffer, PropertyTree, PropertyTreeDict, PropertyTreePrimitive } from "./PropetyTree";

export class MapVersion {
	constructor(
		public readonly main:number,
		public readonly major:number,
		public readonly minor:number,
		public readonly patch:number,
		public readonly qual:boolean,
		)
	{}

	static load(b:ConsumingBuffer)
	{
		const main = b.readUInt16LE();
		const major = b.readUInt16LE();
		const minor = b.readUInt16LE();
		const patch = b.readUInt16LE();
		const qual = b.readUInt8() !== 0;
		return new MapVersion(main,major,minor,patch,qual);
	}

	save():Buffer
	{
		const b = Buffer.alloc(9);
		b.writeUInt16LE(this.main,0);
		b.writeUInt16LE(this.major,2);
		b.writeUInt16LE(this.minor,4);
		b.writeUInt16LE(this.patch,6);
		b.writeInt8(this.qual?1:0,8);
		return b;
	}

}

interface ModSettingsData extends PropertyTreeDict {
	["startup"]:PropertyTreeDict
	["runtime-global"]:PropertyTreeDict
	["runtime-per-user"]:PropertyTreeDict
}

export class ModSettings {
	readonly version: MapVersion;
	readonly settings: ModSettingsData;

	constructor(b:ConsumingBuffer|Buffer)
	{
		if (b instanceof Buffer) { b = new ConsumingBuffer(b); }
		this.version = MapVersion.load(b);
		this.settings = <ModSettingsData>PropertyTree.load(b);
	}

	save():Buffer
	{
		return Buffer.concat([
			this.version.save(),
			PropertyTree.save(this.settings),
		]);
	}

	set(type:"startup"|"runtime-global"|"runtime-per-user",key:string,value?:PropertyTreePrimitive)
	{
		if (value === undefined)
		{
			delete this.settings[type][key];
		} else {
			this.settings[type][key] = {"value" : value};
		}
	}

}

