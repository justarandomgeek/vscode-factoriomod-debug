export class ConsumingBuffer {
	private i: number = 0;
	constructor(private readonly b: Buffer) { }

	readUInt8() {
		const n = this.b.readUInt8(this.i);
		this.i += 1;
		return n;
	}

	readUInt16LE() {
		const n = this.b.readUInt16LE(this.i);
		this.i += 2;
		return n;
	}

	readUInt32LE() {
		const n = this.b.readUInt32LE(this.i);
		this.i += 4;
		return n;
	}

	readBigUInt64LE() {
		const n = this.b.readBigUInt64LE(this.i);
		this.i += 8;
		return n;
	}

	readDoubleLE() {
		const n = this.b.readDoubleLE(this.i);
		this.i += 8;
		return n;
	}

	readString(size:number) {
		const str = this.b.slice(this.i, this.i + size).toString("utf8");
		this.i += size;
		return str;
	}
}
