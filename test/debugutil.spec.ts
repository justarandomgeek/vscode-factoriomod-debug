import { test, suite } from "mocha";
import { expect } from "chai";
import { Duplex } from "stream";

// have to get this via the bundle or it ends up left out of coverage reports...
//TODO: figure out why and import a more sensible way
//@ts-expect-error
import * as _fmtk from "../dist/fmtk";
const fmtk = _fmtk as typeof import("../src/fmtk");
const { BufferSplitter, EncodingUtil } = fmtk;
const { encodeVarInt } = EncodingUtil;

class TestStream extends Duplex {
	_write(chunk: string, _encoding: string, done: () => void) {
		this.emit('data', chunk);
		done();
	}

	_read(_size: number) {
	}
}

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

test('BufferSplitter', async ()=>{
	const ts = new TestStream();
	const bs = new BufferSplitter(ts, [Buffer.from("\n"), {start: Buffer.from("**start**"), end: Buffer.from("**end**")}]);
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

	ts.write("test1\n");
	ts.write("test2**start**test3**end**");
	ts.write("test4");
	ts.write("**start**");
	ts.write("\ntest5\n");
	ts.write("**end**");
	ts.write("\n**start**\n**end**");

	ts.write("\ndone\n");
	await expect(result).eventually.deep.equals([
		Buffer.from("test1"), Buffer.from("test2"), Buffer.from("test3"), Buffer.from("test4"),
		Buffer.from("\ntest5\n"), Buffer.from("\n"),
	]);
});