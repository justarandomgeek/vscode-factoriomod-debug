import { BufferStream } from "./BufferStream";

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

function readPTreeString(b:BufferStream) {
	const empty = b.readUInt8() !== 0;
	if (empty) {
		return "";
	}

	else {
		let size = b.readUInt8();
		if (size === 255) {
			size = b.readUInt32LE();
		}

		return b.readString(size);
	}
}

export abstract class PropertyTree {
	protected constructor(){}

	static load(b:BufferStream) : PropertyTreeData {
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
				return readPTreeString(b);
			case PropertyTreeType.list:
				{
					const count = b.readUInt32LE();
					const arr = <PropertyTreeData[]>[];
					for (let i = 0; i < count; i++) {
						readPTreeString(b);
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
						const keystr = readPTreeString(b);
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