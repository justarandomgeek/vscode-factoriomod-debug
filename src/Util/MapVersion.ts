export class MapVersion {
	constructor(
		public readonly main:number,
		public readonly major:number,
		public readonly minor:number,
		public readonly patch:number,
		public readonly branch:number,
	) {}

	static load(b:Buffer) {
		const main = b.readUInt16LE(0);
		const major = b.readUInt16LE(2);
		const minor = b.readUInt16LE(4);
		const patch = b.readUInt16LE(6);
		const branch = b.readUInt8(8);
		return new MapVersion(main, major, minor, patch, branch);
	}

	save():Buffer {
		const b = Buffer.alloc(9);
		b.writeUInt16LE(this.main, 0);
		b.writeUInt16LE(this.major, 2);
		b.writeUInt16LE(this.minor, 4);
		b.writeUInt16LE(this.patch, 6);
		b.writeUInt8(this.branch, 8);
		return b;
	}

	format() {
		return `${this.main}.${this.major}.${this.minor}-${this.patch}`;
	}

	isBeyond(main:number, major?:number, minor?:number, patch?:number) {
		if (this.main < main) { return false; }

		if (major === undefined) { return true; }
		if (this.major < major) { return false; }

		if (minor === undefined) { return true; }
		if (this.minor < minor) { return false; }

		if (patch === undefined) { return true; }
		if (this.patch < patch) { return false; }

		return true;
	}
}