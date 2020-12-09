export class ConsumingBuffer {
	private i:number = 0;
	constructor(private readonly b:Buffer)
	{}

	readUInt8()
	{
		const n = this.b.readUInt8(this.i);
		this.i += 1;
		return n;
	}

	readUInt16LE()
	{
		const n = this.b.readUInt16LE(this.i);
		this.i += 2;
		return n;
	}

	readUInt32LE()
	{
		const n = this.b.readUInt32LE(this.i);
		this.i += 4;
		return n;
	}

	readDoubleLE()
	{
		const n = this.b.readDoubleLE(this.i);
		this.i += 8;
		return n;
	}

	readString()
	{
		const empty = this.readUInt8()!==0;
		if (empty)
		{
			return "";
		}
		else
		{
			let size = this.readUInt8();
			if (size===255)
			{
				size = this.readUInt32LE();
			}

			const str = this.b.slice(this.i,this.i+size).toString("utf8");
			this.i += size;
			return str;
		}
	}
}

export type PropertyTreePrimitive = null|boolean|number|string;
export type PropertyTreeData = PropertyTreePrimitive|PropertyTreeData[]|PropertyTreeDict;
export type PropertyTreeDict = {[k:string]:PropertyTreeData};

enum PropertyTreeType {
	none = 0,
	bool = 1,
	number = 2,
	string = 3,
	list = 4,
	dictionary = 5,
}

export abstract class PropertyTree {
	protected constructor(){}

	static load(b:ConsumingBuffer) : PropertyTreeData {
		const type:PropertyTreeType = b.readUInt8();
		b.readUInt8(); // discard isAnyType
		switch (type) {
			case PropertyTreeType.none:
				return null;
			case PropertyTreeType.bool:
				return b.readUInt8()!==0;
			case PropertyTreeType.number:
				return b.readDoubleLE();
			case PropertyTreeType.string:
				return b.readString();
			case PropertyTreeType.list:
				{
					const count = b.readUInt32LE();
					const arr = <PropertyTreeData[]>[];
					for (let i = 0; i < count; i++) {
						b.readString();
						const value = PropertyTree.load(b);
						arr.push(value);
					}
					return arr;
				}
			case PropertyTreeType.dictionary:
				{
					const count = b.readUInt32LE();
					const rec:PropertyTreeDict = {};
					for (let i = 0; i < count; i++) {
						const keystr = b.readString();
						if (!keystr)
						{
							throw new Error("Missing key in PropertyTree Dictionary");
						}
						const value = PropertyTree.load(b);
						rec[keystr] = value;
					}
					return rec;
				}
			default:
				throw new Error(`Invalid datatype in PropertyTree ${type}`);
		}
	}

	private static saveString(str:string): Buffer {
		if (!str) {
			return Buffer.from([1]); // no string
		}

		const strbuff = Buffer.from(str,"utf8");

		let size = Buffer.alloc(1);

		if (strbuff.length < 255)
		{
			size.writeInt8(strbuff.length);
		} else {
			size = Buffer.alloc(5);
			size.writeInt8(255);
			size.writeUInt32LE(strbuff.length,1);
		}
		return Buffer.concat([
			Buffer.from([0]), // has string
			size,
			strbuff,
		]);
	}

	private static typeTag(type:PropertyTreeType): Buffer {
		return Buffer.from([type, 0 /* isAnyType */ ]);
	}

	static save(value:PropertyTreeData):Buffer {
		switch (typeof value) {
			case "string":
				{
					return Buffer.concat([
						PropertyTree.typeTag(PropertyTreeType.string),
						PropertyTree.saveString(value)
					]);
				}
			case "boolean":
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.bool),
					Buffer.from([value?1:0])
				]);


			case "number":
				{
					const b = Buffer.alloc(8);
					b.writeDoubleLE(value);
					return Buffer.concat([
						PropertyTree.typeTag(PropertyTreeType.number),
						b
					]);
				}
			default:
				if (value === null)
				{
					return PropertyTree.typeTag(PropertyTreeType.none);
				}

				if (Array.isArray(value))
				{
					const size = Buffer.alloc(4);
					size.writeInt32LE(value.length);
					return Buffer.concat([
						PropertyTree.typeTag(PropertyTreeType.list),
						size,
						Buffer.concat(value.map((v) => {
							return Buffer.concat([
								PropertyTree.saveString(""), // no key for list
								PropertyTree.save(v)
							]);
						}))
					]);
				}

				// anything left is PropertyTreeDict
				{
					let buffs = <Buffer[]>[];
					for (const k in value) {
						if (Object.prototype.hasOwnProperty.call(value, k)) {
							const v = value[k];
							buffs.push(
								Buffer.concat([
									PropertyTree.saveString(k),
									PropertyTree.save(v)
								]));
						}
					}

					const size = Buffer.alloc(4);
					size.writeInt32LE(buffs.length);

					return Buffer.concat([
						PropertyTree.typeTag(PropertyTreeType.dictionary),
						size,
						Buffer.concat(buffs)
					]);
				}
		}
	}
}