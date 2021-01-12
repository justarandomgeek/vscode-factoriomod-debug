import { Readable } from "stream";

export class BufferStream extends Readable {

	constructor(b:Buffer) {
		super();
		this.push(b);
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

	readBigUInt64LE() {
		const b:Buffer = this.read(8);
		return b.readBigUInt64LE();
	}

	readDoubleLE() {
		const b:Buffer = this.read(8);
		return b.readDoubleLE();
	}

	readString(size:number) {
		const b:Buffer = this.read(size);
		return b.toString("utf8");
	}
}
