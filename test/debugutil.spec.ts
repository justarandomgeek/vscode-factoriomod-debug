/* eslint-disable @typescript-eslint/no-unused-expressions */
import { test, suite } from "node:test";
import assert from 'node:assert/strict';
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { Duplex } from "stream";

import { BufferSplitter } from '../src/Util/BufferSplitter.ts';
import { BufferStream } from '../src/Util/BufferStream.ts';
import { encodeVarInt } from '../src/Util/EncodingUtil.ts';
import { PropertyTreeType, loadPTree, savePTree } from '../src/Util/PropertyTree.ts';
import { MapVersion } from '../src/Util/MapVersion.ts';

chai.use(chaiAsPromised);

class TestStream extends Duplex {
	_write(chunk: string, _encoding: string, done: () => void) {
		this.emit('data', chunk);
		done();
	}

	_read(_size: number) {
	}
}

await suite('EncodingUtil', async ()=>{
	await test('encodeVarInt 0', ()=>{
		assert.deepEqual(encodeVarInt(0), Buffer.from([0]));
	});
	await test('encodeVarInt 1', ()=>{
		assert.deepEqual(encodeVarInt(1), Buffer.from([1]));
	});
	await test('encodeVarInt 0x7f', ()=>{
		assert.deepEqual(encodeVarInt(0x7f), Buffer.from([0x7f]));
	});
	await test('encodeVarInt 0x80', ()=>{
		assert.deepEqual(encodeVarInt(0x80), Buffer.from([0b110_0_0010, 0b10_00_0000]));
	});
	await test('encodeVarInt 0x7ff', ()=>{
		assert.deepEqual(encodeVarInt(0x7ff), Buffer.from([0b110_1_1111, 0b10_11_1111]));
	});
	await test('encodeVarInt 0x800', ()=>{
		assert.deepEqual(encodeVarInt(0x800), Buffer.from([0b1110_0000, 0b10_10_0000, 0b10_00_0000]));
	});
	await test('encodeVarInt 0xffff', ()=>{
		assert.deepEqual(encodeVarInt(0xffff), Buffer.from([0b1110_1111, 0b10_11_1111, 0b10_11_1111]));
	});
	await test('encodeVarInt 0x10000', ()=>{
		assert.deepEqual(encodeVarInt(0x1_0000), Buffer.from([0b11110_000, 0b10_01_0000, 0b10_00_0000, 0b10_00_0000]));
	});
	await test('encodeVarInt 0x1fffff', ()=>{
		assert.deepEqual(encodeVarInt(0x1f_ffff), Buffer.from([0b11110_111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111]));
	});
	await test('encodeVarInt 0x200000', ()=>{
		assert.deepEqual(encodeVarInt(0x20_0000), Buffer.from([0b111110_00, 0b10_00_1000, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000]));
	});
	await test('encodeVarInt 0x3ffffff', ()=>{
		assert.deepEqual(encodeVarInt(0x3ff_ffff), Buffer.from([0b111110_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111]));
	});
	await test('encodeVarInt 0x4000000', ()=>{
		assert.deepEqual(encodeVarInt(0x400_0000), Buffer.from([0b111111_00, 0b10_00_0100, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000]));
	});
	await test('encodeVarInt 0xfffffff0', ()=>{
		assert.deepEqual(encodeVarInt(0xffff_fff0), Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_0000]));
	});
	await test('encodeVarInt -1', ()=>{
		assert.throws(()=>encodeVarInt(-1));
	});

	// some values are reserved for remapping specials
	await test('encodeVarInt 0xfffffff1', ()=>{
		assert.throws(()=>encodeVarInt(0xffff_fff1));
	});
	await test('encodeVarInt 0xffffffff', ()=>{
		assert.throws(()=>encodeVarInt(0xffff_ffff));
	});


	// and test the specials...
	await test('encodeVarInt 10', ()=>{
		assert.deepEqual(encodeVarInt(10), Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111]));
	});
	await test('encodeVarInt 13', ()=>{
		assert.deepEqual(encodeVarInt(13), Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1101]));
	});
	await test('encodeVarInt 26', ()=>{
		assert.deepEqual(encodeVarInt(26), Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1110]));
	});
});

await test('BufferSplitter', async ()=>{
	const ts = new TestStream();
	const bs = new BufferSplitter(ts, [Buffer.from("\n"), Buffer.from("lua_debug> "), {start: Buffer.from("**start**"), end: Buffer.from("**end**")}]);
	const result = new Promise((resolve)=>{
		const segments:Buffer[] = [];
		bs.on('segment', (b:Buffer)=>{
			if (b.toString() === "done") {
				resolve(segments);
			} else {
				segments.push(b);
			}
		});
	});

	ts.write("test1\nte");
	ts.write("st2**start**test3**end**");
	ts.write("test4");
	ts.write("**start**");
	ts.write("\ntest5\n");
	ts.write("**end**");
	ts.write("\n**start**\n**end**");
	ts.write("\n**start**\n**start**");
	ts.write("\n**end**");
	ts.write("lua_de");
	ts.write("bug> ");
	ts.write("lua_debug> ");
	ts.write("lua_debug> ");
	ts.write("lua_debug> ");

	ts.write("end\n");

	ts.write("\ndone\n");
	await expect(result).eventually.deep.equals([
		Buffer.from("test1"), Buffer.from("test2"), Buffer.from("test3"), Buffer.from("test4"),
		Buffer.from("\ntest5\n"), Buffer.from("\n"), Buffer.from("\n**start**\n"), Buffer.from("end"),
	]);
});

await test('PropertyTree', ()=>{
	expect(savePTree({type: PropertyTreeType.none})).deep.equals(Buffer.from([0, 0]));

	expect(savePTree({type: PropertyTreeType.bool, value: false})).deep.equals(Buffer.from([1, 0, 0]));
	expect(savePTree({type: PropertyTreeType.bool, value: true})).deep.equals(Buffer.from([1, 0, 1]));

	expect(savePTree({type: PropertyTreeType.number, value: 3.14})).deep.equals(Buffer.from([2, 0, 31, 133, 235, 81, 184, 30, 9, 64]));

	expect(savePTree({type: PropertyTreeType.string, value: ""})).deep.equals(Buffer.from([3, 0, 1]));
	expect(savePTree({type: PropertyTreeType.string, value: "foo"})).deep.equals(Buffer.from([3, 0, 0, 3, 102, 111, 111]));
	expect(savePTree({type: PropertyTreeType.string, value: "a".repeat(200)})).deep.equals(
		Buffer.concat([Buffer.from([3, 0, 0, 200]), Buffer.from("a".repeat(200))]));
	expect(savePTree({type: PropertyTreeType.string, value: "a".repeat(300)})).deep.equals(
		Buffer.concat([Buffer.from([3, 0, 0, 255, 44, 1, 0, 0]), Buffer.from("a".repeat(300))]));

	expect(savePTree({type: PropertyTreeType.list, value: [
		{type: PropertyTreeType.bool, value: false},
	]})).deep.equals(
		Buffer.from([4, 0, 1, 0, 0, 0, 1, 1, 0, 0]));

	expect(savePTree({type: PropertyTreeType.dictionary, value: {
		a: {type: PropertyTreeType.bool, value: false},
	}})).deep.equals(
		Buffer.from([5, 0, 1, 0, 0, 0, 0, 1, 97, 1, 0, 0]));

	expect(savePTree({type: PropertyTreeType.signedinteger, value: BigInt("0x1234567812345678")})).deep.equals(
		Buffer.from([6, 0, 0x78, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12]));
	expect(savePTree({type: PropertyTreeType.signedinteger, value: -BigInt("0x1234567812345678")})).deep.equals(
		Buffer.from([6, 0, 0x88, 0xa9, 0xcb, 0xed, 0x87, 0xa9, 0xcb, 0xed]));

	expect(savePTree({type: PropertyTreeType.unsignedinteger, value: BigInt("0xff34567812345678")})).deep.equals(
		Buffer.from([7, 0, 0x78, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0xff]));

	expect(loadPTree(new BufferStream(Buffer.from([0, 0])))).deep.equals({type: PropertyTreeType.none});

	expect(loadPTree(new BufferStream(Buffer.from([1, 0, 0])))).deep.equals({type: PropertyTreeType.bool, value: false});
	expect(loadPTree(new BufferStream(Buffer.from([1, 0, 1])))).deep.equals({type: PropertyTreeType.bool, value: true});

	expect(loadPTree(new BufferStream(Buffer.from([2, 0, 31, 133, 235, 81, 184, 30, 9, 64])))).deep.equals({type: PropertyTreeType.number, value: 3.14});

	expect(loadPTree(new BufferStream(Buffer.from([3, 0, 1])))).deep.equals({type: PropertyTreeType.string, value: ""});
	expect(loadPTree(new BufferStream(Buffer.from([3, 0, 0, 3, 102, 111, 111])))).deep.equals({type: PropertyTreeType.string, value: "foo"});
	expect(loadPTree(new BufferStream(Buffer.concat([Buffer.from([3, 0, 0, 200]), Buffer.from("a".repeat(200))]))))
		.deep.equals({type: PropertyTreeType.string, value: "a".repeat(200)});
	expect(loadPTree(new BufferStream(Buffer.concat([Buffer.from([3, 0, 0, 255, 44, 1, 0, 0]), Buffer.from("a".repeat(300))]))))
		.deep.equals({type: PropertyTreeType.string, value: "a".repeat(300)});



	expect(loadPTree(new BufferStream(Buffer.from([4, 0, 1, 0, 0, 0, 1, 1, 0, 0]))))
		.deep.equals({type: PropertyTreeType.list, value: [
			{type: PropertyTreeType.bool, value: false},
		]});

	expect(loadPTree(new BufferStream(Buffer.from([5, 0, 1, 0, 0, 0, 0, 1, 97, 1, 0, 0]))))
		.deep.equals({type: PropertyTreeType.dictionary, value: {
			a: {type: PropertyTreeType.bool, value: false},
		}});

	expect(loadPTree(new BufferStream(Buffer.from([6, 0, 0x78, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0x12]))))
		.deep.equals({type: PropertyTreeType.signedinteger, value: BigInt("0x1234567812345678")});

	expect(loadPTree(new BufferStream(Buffer.from([6, 0, 0x88, 0xa9, 0xcb, 0xed, 0x87, 0xa9, 0xcb, 0xed]))))
		.deep.equals({type: PropertyTreeType.signedinteger, value: -BigInt("0x1234567812345678")});


	expect(loadPTree(new BufferStream(Buffer.from([7, 0, 0x78, 0x56, 0x34, 0x12, 0x78, 0x56, 0x34, 0xff]))))
		.deep.equals({type: PropertyTreeType.unsignedinteger, value: BigInt("0xff34567812345678")});

});

await test('MapVersion', ()=>{
	expect(MapVersion.load(Buffer.from([1, 0, 2, 0, 3, 0, 4, 0, 5])))
		.instanceOf(MapVersion)
		.include({ main: 1, major: 2, minor: 3, patch: 4, branch: 5 });

	expect(new MapVersion(1, 2, 3, 4, 5).save()).deep.equals(Buffer.from([1, 0, 2, 0, 3, 0, 4, 0, 5]));

	expect(new MapVersion(1, 2, 3, 4, 0).format()).equals("1.2.3-4");

	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 2, 3, 3)).is.true;
	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 2, 3, 4)).is.true;
	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 2, 3, 5)).is.false;

	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 2, 2, 0)).is.true;
	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 2, 4, 0)).is.false;

	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 1, 0, 0)).is.true;
	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(1, 3, 0, 0)).is.false;

	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(0, 99, 0, 0)).is.true;
	expect(new MapVersion(1, 2, 3, 4, 0).isBeyond(2, 0, 0, 0)).is.false;

	expect(new MapVersion(2, 0, 0, 0, 0).isBeyond(1, 2, 3, 4)).is.true;
});