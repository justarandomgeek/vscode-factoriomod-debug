import { test, suite } from "mocha";
import { expect } from "chai";
import { encodeVarInt } from "../src/Util/EncodingUtil";

suite('EncodingUtil', ()=>{
	test('encodeVarInt', ()=>{
		expect(encodeVarInt(0).equals(Buffer.from([0])));
		expect(encodeVarInt(1).equals(Buffer.from([1])));
		expect(encodeVarInt(0x7f).equals(Buffer.from([0x7f])));

		expect(encodeVarInt(0x80).equals(Buffer.from([0b110_1_0000, 0b10_00_0000])));
		expect(encodeVarInt(0x7ff).equals(Buffer.from([0b110_1_1111, 0b10_11_1111])));

		expect(encodeVarInt(0x800).equals(Buffer.from([0b1110_1000, 0b10_00_0000, 0b10_00_0000])));
		expect(encodeVarInt(0xffff).equals(Buffer.from([0b1110_1111, 0b10_11_1111, 0b10_11_1111])));

		expect(encodeVarInt(0x1_0000).equals(Buffer.from([0b11110_100, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000])));
		expect(encodeVarInt(0x1f_ffff).equals(Buffer.from([0b11110_111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111])));

		expect(encodeVarInt(0x20_0000).equals(Buffer.from([0b111110_10, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000])));
		expect(encodeVarInt(0x3ff_ffff).equals(Buffer.from([0b111110_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111])));

		expect(encodeVarInt(0x400_0000).equals(Buffer.from([0b111111_10, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000, 0b10_00_0000])));
		expect(encodeVarInt(0xffff_fff0).equals(Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_0000])));

		expect(()=>encodeVarInt(-1)).throws();

		// some values are reserved for remapping specials
		expect(()=>encodeVarInt(0xffff_fff1)).throws();
		expect(()=>encodeVarInt(0xffff_ffff)).throws();

		// and test the specials...
		expect(encodeVarInt(10).equals(Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111])));
		expect(encodeVarInt(13).equals(Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1101])));
		expect(encodeVarInt(26).equals(Buffer.from([0b111111_11, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1111, 0b10_11_1110])));
	});
});