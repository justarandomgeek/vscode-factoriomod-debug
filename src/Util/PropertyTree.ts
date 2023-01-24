import type { BufferStream } from "./BufferStream";

export type PropertyTreeData =
	{ type:PropertyTreeType.none } |
	{ type:PropertyTreeType.bool; value:boolean } |
	{ type:PropertyTreeType.number; value:number } |
	{ type:PropertyTreeType.string; value:string } |
	{ type:PropertyTreeType.list; value:PropertyTreeData[] } |
	{ type:PropertyTreeType.dictionary; value:PropertyTreeDict } |
	{ type:PropertyTreeType.signedinteger|PropertyTreeType.unsignedinteger; value:bigint };

export type PropertyTreeDict = {[k:string]:PropertyTreeData};

export enum PropertyTreeType {
	none = 0,
	bool = 1,
	number = 2,
	string = 3,
	list = 4,
	dictionary = 5,
	signedinteger = 6,
	unsignedinteger = 7
}

function readPTreeString(b:BufferStream) {
	const empty = b.readUInt8() !== 0;
	if (empty) {
		return "";
	} else {
		let size = b.readUInt8();
		if (size === 255) {
			size = b.readUInt32LE();
		}

		return b.readString(size);
	}
}

export abstract class PropertyTree {
	protected constructor() {}

	static load(b:BufferStream) : PropertyTreeData {
		const type:PropertyTreeType = b.readUInt8();
		b.readUInt8(); // discard isAnyType
		switch (type) {
			case PropertyTreeType.none:
				return { type: type };
			case PropertyTreeType.bool:
				return { type: type, value: b.readUInt8()!==0 };
			case PropertyTreeType.number:
				return { type: type, value: b.readDoubleLE() };
			case PropertyTreeType.string:
				return { type: type, value: readPTreeString(b) };
			case PropertyTreeType.list:
			{
				const count = b.readUInt32LE();
				const arr = <PropertyTreeData[]>[];
				for (let i = 0; i < count; i++) {
					readPTreeString(b);
					const value = PropertyTree.load(b);
					arr.push(value);
				}
				return { type: type, value: arr };
			}
			case PropertyTreeType.dictionary:
			{
				const count = b.readUInt32LE();
				const rec:PropertyTreeDict = {};
				for (let i = 0; i < count; i++) {
					const keystr = readPTreeString(b);
					if (!keystr) {
						throw new Error("Missing key in PropertyTree Dictionary");
					}
					const value = PropertyTree.load(b);
					rec[keystr] = value;
				}
				return { type: type, value: rec };
			}
			case PropertyTreeType.signedinteger:
				return { type: type, value: b.readBigInt64LE() };
			case PropertyTreeType.unsignedinteger:
				return { type: type, value: b.readBigUInt64LE() };
			default:
				throw new Error(`Invalid datatype in PropertyTree ${type}`);
		}
	}

	private static saveString(str:string): Buffer {
		if (!str) {
			return Buffer.from([1]); // no string
		}

		const strbuff = Buffer.from(str, "utf8");

		let size = Buffer.alloc(1);

		if (strbuff.length < 255) {
			size.writeInt8(strbuff.length);
		} else {
			size = Buffer.alloc(5);
			size.writeInt8(255);
			size.writeUInt32LE(strbuff.length, 1);
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

	static save(tree:PropertyTreeData):Buffer {
		switch (tree.type) {
			case PropertyTreeType.string:
			{
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.string),
					PropertyTree.saveString(tree.value),
				]);
			}
			case PropertyTreeType.bool:
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.bool),
					Buffer.from([tree.value?1:0]),
				]);


			case PropertyTreeType.number:
			{
				const b = Buffer.alloc(8);
				b.writeDoubleLE(tree.value);
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.number),
					b,
				]);
			}
			case PropertyTreeType.signedinteger:
			{
				const b = Buffer.alloc(8);
				b.writeBigInt64LE(tree.value);
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.signedinteger),
					b,
				]);
			}
			case PropertyTreeType.unsignedinteger:
			{
				const b = Buffer.alloc(8);
				b.writeBigUInt64LE(tree.value);
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.unsignedinteger),
					b,
				]);
			}
			case PropertyTreeType.none:
			{
				return PropertyTree.typeTag(PropertyTreeType.none);
			}
			case PropertyTreeType.list:
			{
				const size = Buffer.alloc(4);
				size.writeInt32LE(tree.value.length);
				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.list),
					size,
					Buffer.concat(tree.value.map((v)=>{
						return Buffer.concat([
							PropertyTree.saveString(""), // no key for list
							PropertyTree.save(v),
						]);
					})),
				]);
			}
			case PropertyTreeType.dictionary:
			{
				let buffs = <Buffer[]>[];
				for (const k in tree.value) {
					if (Object.prototype.hasOwnProperty.call(tree.value, k)) {
						const v = tree.value[k];
						buffs.push(
							Buffer.concat([
								PropertyTree.saveString(k),
								PropertyTree.save(v),
							]));
					}
				}

				const size = Buffer.alloc(4);
				size.writeInt32LE(buffs.length);

				return Buffer.concat([
					PropertyTree.typeTag(PropertyTreeType.dictionary),
					size,
					Buffer.concat(buffs),
				]);
			}
			default:
				throw new Error(`Invalid datatype in PropertyTree ${(tree as PropertyTreeData).type}`);

		}
	}
}