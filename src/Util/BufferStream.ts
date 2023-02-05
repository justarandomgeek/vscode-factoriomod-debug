import { Readable } from "stream";

export class BufferStream extends Readable {

	constructor(b:Uint8Array) {
		super();
		this.push(b);
		this.push(null);
	}

	readUInt8() {
		const b:Buffer = this.read(1);
		return b.readUInt8();
	}

	readUInt16LE() {
		const b:Buffer = this.read(2);
		return b.readUInt16LE();
	}

	readUInt32LE() {
		const b:Buffer = this.read(4);
		return b.readUInt32LE();
	}

	readInt32LE() {
		const b:Buffer = this.read(4);
		return b.readInt32LE();
	}

	readBigInt64LE() {
		const b:Buffer = this.read(8);
		return b.readBigInt64LE();
	}

	readBigUInt64LE() {
		const b:Buffer = this.read(8);
		return b.readBigUInt64LE();
	}

	readDoubleLE() {
		const b:Buffer = this.read(8);
		return b.readDoubleLE();
	}

	readPackedUInt_8_32() {
		let size = this.readUInt8();
		if (size === 0xff) {
			size = this.readUInt32LE();
		}
		return size;
	}

	readPackedUInt_16_32() {
		let size = this.readUInt16LE();
		if (size === 0xffff) {
			size = this.readUInt32LE();
		}
		return size;
	}

	readString(size:number) {
		if (size===0) { return ""; }
		const b:Buffer = this.read(size);
		return b.toString("utf8");
	}
}
