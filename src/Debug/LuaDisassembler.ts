import type { DebugProtocol } from '@vscode/debugprotocol';

/* eslint-disable no-bitwise */
export enum LuaOpcode {
	OP_MOVE, /*	A B	R(A) := R(B)					*/
	OP_LOADK, /*	A Bx	R(A) := Kst(Bx)					*/
	OP_LOADKX, /*	A 	R(A) := Kst(extra arg)				*/
	OP_LOADBOOL, /*	A B C	R(A) := (Bool)B; if (C) pc++			*/
	OP_LOADNIL, /*	A B	R(A), R(A+1), ..., R(A+B) := nil		*/
	OP_GETUPVAL, /*	A B	R(A) := UpValue[B]				*/

	OP_GETTABUP, /*	A B C	R(A) := UpValue[B][RK(C)]			*/
	OP_GETTABLE, /*	A B C	R(A) := R(B)[RK(C)]				*/

	OP_SETTABUP, /*	A B C	UpValue[A][RK(B)] := RK(C)			*/
	OP_SETUPVAL, /*	A B	UpValue[B] := R(A)				*/
	OP_SETTABLE, /*	A B C	R(A)[RK(B)] := RK(C)				*/

	OP_NEWTABLE, /*	A B C	R(A) := {} (size = B,C)				*/

	OP_SELF, /*	A B C	R(A+1) := R(B); R(A) := R(B)[RK(C)]		*/

	OP_ADD, /*	A B C	R(A) := RK(B) + RK(C)				*/
	OP_SUB, /*	A B C	R(A) := RK(B) - RK(C)				*/
	OP_MUL, /*	A B C	R(A) := RK(B) * RK(C)				*/
	OP_DIV, /*	A B C	R(A) := RK(B) / RK(C)				*/
	OP_MOD, /*	A B C	R(A) := RK(B) % RK(C)				*/
	OP_POW, /*	A B C	R(A) := RK(B) ^ RK(C)				*/
	OP_UNM, /*	A B	R(A) := -R(B)					*/
	OP_NOT, /*	A B	R(A) := not R(B)				*/
	OP_LEN, /*	A B	R(A) := length of R(B)				*/

	OP_CONCAT, /*	A B C	R(A) := R(B).. ... ..R(C)			*/

	OP_JMP, /*	A sBx	pc+=sBx; if (A) close all upvalues >= R(A) + 1	*/
	OP_EQ, /*	A B C	if ((RK(B) == RK(C)) ~= A) then pc++		*/
	OP_LT, /*	A B C	if ((RK(B) <  RK(C)) ~= A) then pc++		*/
	OP_LE, /*	A B C	if ((RK(B) <= RK(C)) ~= A) then pc++		*/

	OP_TEST, /*	A C	if not (R(A) <=> C) then pc++			*/
	OP_TESTSET, /*	A B C	if (R(B) <=> C) then R(A) := R(B) else pc++	*/

	OP_CALL, /*	A B C	R(A), ... ,R(A+C-2) := R(A)(R(A+1), ... ,R(A+B-1)) */
	OP_TAILCALL, /*	A B C	return R(A)(R(A+1), ... ,R(A+B-1))		*/
	OP_RETURN, /*	A B	return R(A), ... ,R(A+B-2)	(see note)	*/

	OP_FORLOOP, /*	A sBx	R(A)+=R(A+2);
				if R(A) <?= R(A+1) then { pc+=sBx; R(A+3)=R(A) }*/
	OP_FORPREP, /*	A sBx	R(A)-=R(A+2); pc+=sBx				*/

	OP_TFORCALL, /*	A C	R(A+3), ... ,R(A+2+C) := R(A)(R(A+1), R(A+2));	*/
	OP_TFORLOOP, /*	A sBx	if R(A+1) ~= nil then { R(A)=R(A+1); pc += sBx }*/

	OP_SETLIST, /*	A B C	R(A)[(C-1)*FPF+i] := R(A+i), 1 <= i <= B	*/

	OP_CLOSURE, /*	A Bx	R(A) := closure(KPROTO[Bx])			*/

	OP_VARARG, /*	A B	R(A), R(A+1), ..., R(A+B-2) = vararg		*/

	OP_EXTRAARG/*	Ax	extra (larger) argument for previous opcode	*/
}

export enum LuaConstType {
	Nil = 0,
	Boolean = 1,
	Number = 3,
	String = 4,
}

const lua_header = Buffer.from([
	0x1b, 0x4c, 0x75, 0x61, // LUA_SIGNATURE "\x1bLua"
	0x52, 0x00, // lua version
	0x01, 0x04, 0x08, 0x04, 0x08, 0x00, // lua config parameters: LE, 4 byte int, 8 byte size_t, 4 byte instruction, 8 byte LuaNumber, number is double
	0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a, // magic
]);

function readLuaStringBuffer(b:Buffer, i:number):[Buffer, number] {
	const size = b.readBigUInt64LE(i); i+=8;
	let bb:Buffer;
	if (size > 0) {
		bb = b.subarray(i, i+Number(size)-1);
		i+=Number(size);
	} else {
		bb = Buffer.alloc(0, 0);
	}
	return [bb, i];
}

/*
|   B   |   C   |   A   |   Op   |
|       Bx      |   A   |   Op   |
|           Ax          |   Op   |
*/
export class LuaInstruction {
	constructor(readonly raw:number, readonly line:number) {}

	public get Op() : LuaOpcode {
		return this.raw & 0x3f;
	}

	public get A() {
		return (this.raw >> 6)& 0xff;
	}
	public get B() {
		return (this.raw >> 23)& 0x1ff;
	}
	public get C() {
		return (this.raw >> 14)& 0x1ff;
	}
	public get Ax() {
		return (this.raw >> 6)& 0x3ffffff;
	}
	public get Bx() {
		return (this.raw >> 14)& 0x3ffff;
	}

	public get sBx() {
		return this.Bx - 0x1ffff;
	}
}

class LuaUpval {
	name?:string;
	readonly instack:boolean;
	readonly idx:number;

	constructor(b:Buffer, i:number) {
		this.instack = b.readUInt8(i) !== 0;
		this.idx = b.readUInt8(i+1);
	}
}

export class LuaLocal {
	readonly name:string;
	readonly start:number;
	readonly end:number;

	readonly dumpsize:number;

	constructor(b:Buffer, i:number) {
		let bb:Buffer;
		[bb, i] = readLuaStringBuffer(b, i);
		this.name = bb.toString("utf8");
		this.start = b.readUInt32LE(i); i+=4;
		this.end = b.readUInt32LE(i); i+=4;
		this.dumpsize = (bb.length===0 ? 8 : 8+bb.length+1 ) + 8;
	}
}

export class LuaConstant {
	public constructor(type:LuaConstType.Nil);
	public constructor(type:LuaConstType.Boolean, value:boolean);
	public constructor(type:LuaConstType.Number, value:number);
	public constructor(type:LuaConstType.String, value:Buffer);
	public constructor(
		public readonly type:LuaConstType,
		public readonly value?:boolean|number|Buffer
	) {
		switch (type) {
			case LuaConstType.Nil:
				if (value !== undefined) { throw new Error(`Invalid Lua Constant: ${type} ${value}`); }
				break;
			case LuaConstType.Boolean:
				if (typeof value !== "boolean") { throw new Error(`Invalid Lua Constant: ${type} ${value}`); }
				break;
			case LuaConstType.Number:
				if (typeof value !== "number") { throw new Error(`Invalid Lua Constant: ${type} ${value}`); }
				break;
			case LuaConstType.String:
				if (!(value instanceof Buffer)) { throw new Error(`Invalid Lua Constant: ${type} ${value}`); }
				break;
			default:
				throw new Error(`Invalid Lua Constant Type: ${type}`);
		}
	}


	public get label() : string {
		switch (this.type) {
			case LuaConstType.Nil:
				return "nil";
			case LuaConstType.Boolean:
			case LuaConstType.Number:
				return this.value!.toString();
			case LuaConstType.String:
				return `"${(<Buffer> this.value).toString("utf8")}"`; //TODO: escape strings
			default:
				throw new Error(`Invalid Lua Constant Type: ${this.type} ${this.value}`);
		}
	}

}

export class LuaFunction {
	readonly source:string;
	readonly nparam:number;
	readonly is_vararg:boolean;
	readonly maxstack:number;
	readonly locals:LuaLocal[]=[];
	readonly upvals:LuaUpval[]=[];
	readonly instruction_count:number;
	private readonly _instraw:Buffer;
	private readonly _instlines:Buffer;
	readonly constants:LuaConstant[]=[];
	readonly inner_functions:LuaFunction[]=[];
	readonly firstline:number;
	readonly lastline:number;

	private readonly nextbyte:number;

	constructor(b:Buffer, i?:number) {
		if (i===undefined) {
			if (!b.subarray(0, lua_header.length).equals(lua_header)) {
				throw new Error(`Invalid Header`);
			}
			i = lua_header.length;
		}

		this.firstline = b.readUInt32LE(i); i+=4;
		this.lastline = b.readUInt32LE(i); i+=4;
		this.nparam = b[i++];
		this.is_vararg = b[i++] !== 0;
		this.maxstack = b[i++];

		this.instruction_count = b.readUInt32LE(i); i+=4;
		this._instraw = b.subarray(i, i + this.instruction_count * 4);
		i += this.instruction_count * 4;

		const num_const = b.readUInt32LE(i); i+=4;
		for (let j = 0; j < num_const; j++) {
			const type:LuaConstType = b[i++];
			switch (type) {
				case LuaConstType.Nil:
					this.constants.push(new LuaConstant(LuaConstType.Nil));
					break;
				case LuaConstType.Boolean:
					this.constants.push(new LuaConstant(LuaConstType.Boolean, b[i++]!==0));
					break;
				case LuaConstType.Number:
					this.constants.push(new LuaConstant(LuaConstType.Number, b.readDoubleLE(i))); i+=8;
					break;
				case LuaConstType.String:
					let bb:Buffer;
					[bb, i] = readLuaStringBuffer(b, i);
					this.constants.push(new LuaConstant(LuaConstType.String, bb));
					break;
				default:
					throw new Error(`Invalid Lua Constant Type: ${type}`);
			}
		}

		const num_protos = b.readUInt32LE(i); i+=4;
		for (let j = 0; j < num_protos; j++) {
			const f:LuaFunction = new LuaFunction(b, i);
			i = f.nextbyte;
			this.inner_functions.push(f);
		}

		const num_upvals = b.readUInt32LE(i); i+=4;
		for (let j = 0; j < num_upvals; j++) {
			this.upvals.push(new LuaUpval(b, i)); i+=2;
		}

		{
			let bb:Buffer;
			[bb, i] = readLuaStringBuffer(b, i);
			this.source = bb.toString("utf8");
		}

		const num_lineinfo = b.readUInt32LE(i); i+=4;
		if (num_lineinfo !== this.instruction_count) { throw new Error("line info count mismatch"); }
		this._instlines = b.subarray(i, i + this.instruction_count * 4);
		i += this.instruction_count * 4;

		const num_locals = b.readUInt32LE(i); i+=4;
		for (let j = 0; j <  num_locals; j++) {
			const l = new LuaLocal(b, i);
			i += l.dumpsize;
			this.locals.push(l);
		}

		const num_upval_names = b.readUInt32LE(i); i+=4;
		for (let j = 0; j < num_upval_names; j++) {
			let bb:Buffer;
			[bb, i] = readLuaStringBuffer(b, i);
			this.upvals[j].name = bb.toString("utf8");
		}
		this.nextbyte = i;
	}

	private _baseAddr?:number;
	public get baseAddr() : number|undefined {
		return this._baseAddr;
	}
	public rebase(base:number) : number {
		let nextbase = base;
		this._baseAddr = nextbase;
		nextbase += this.instruction_count;
		this.inner_functions.forEach(f=>{
			nextbase = f.rebase(nextbase);
		});
		return nextbase;
	}

	private readonly _instructions:(LuaInstruction|undefined)[]=[];
	public instruction(pc:number) {
		if (pc > this.instruction_count-1) {
			return undefined;
		}
		let i = this._instructions[pc];
		if (i===undefined) {
			i = new LuaInstruction(
				this._instraw.readUint32LE(pc*4),
				this._instlines.readUint32LE(pc*4),
			);
			this._instructions[pc] = i;
		}
		return i;
	}

	public get lines() {
		const l = [];
		for (let i = 0; i < this.instruction_count; i++) {
			l[i] = this._instlines.readUInt32LE(i*4);
		}
		return l;
	}

	public walk_functions(fn:(f:LuaFunction)=>void) {
		fn(this);
		this.inner_functions.forEach(lf=>lf.walk_functions(fn));
	}

	private getFunctionAtStartLine(startline:number) : LuaFunction|undefined {
		if (this.firstline === startline) {
			return this;
		}
		if ( this.firstline < startline &&
			(this.lastline===0 || this.lastline > startline) &&
			this.inner_functions) {
			for (let i = 0; i < this.inner_functions.length; i++) {
				const f = this.inner_functions[i].getFunctionAtStartLine(startline);
				if (f) {
					return f;
				}
			}
		}
		return;
	}

	public getInstructionsAtBase(base:number, count:number) : DebugProtocol.DisassembledInstruction[]|undefined {
		if (count===0  || !this._baseAddr) { return; }
		if (this._baseAddr <= base && this._baseAddr+this.instruction_count > base) {
			const offset = base - this._baseAddr;
			const instrs:DebugProtocol.DisassembledInstruction[] = [];
			if (offset + count > this.instruction_count) {
				count = this.instruction_count - offset;
			}
			for (let i = 0; i < count; i++) {
				const inst = this.instruction(i+offset)!;
				instrs.push({
					address: "0x"+(this._baseAddr+offset+i).toString(16),
					instruction: this.getInstructionLabel(i+offset),
					line: inst.line,
					instructionBytes: inst.raw.toString(16).padStart(8, "0"),
					symbol: i+offset===0 ? this.source+":"+this.firstline : undefined,
				});
			}
			return instrs;
		}
		return;
	}


	getInstructionLabel(pc:number) {
		const current = this.instruction(pc);
		if (!current) { throw new Error("Invalid PC"); }
		const next = this.instruction(pc+1);
		switch (current.Op) {
			case LuaOpcode.OP_LOADK:
				return `LOADK     ${this.getRegisterLabel(pc, current.A)} := ${this.constants[current.Bx].label}`;
			case LuaOpcode.OP_LOADKX:
				if (!next) { throw new Error("Invalid PC"); }
				return `LOADKX    ${this.getRegisterLabel(pc, current.A)} := ${this.constants[next.Ax].label}`;
			case LuaOpcode.OP_LOADBOOL:
				return `LOADBOOL  ${this.getRegisterLabel(pc, current.A)} := ${current.B!==0}${current.C!==0?" pc++":""}`;
			case LuaOpcode.OP_LOADNIL:
				return `LOADNIL   ${this.getRegisterLabel(pc, current.A)}...${this.getRegisterLabel(pc, current.A+current.B)})`;
			case LuaOpcode.OP_GETUPVAL:
				return `GETUPVAL  ${this.getRegisterLabel(pc, current.A)} := ${this.getUpvalLabel(current.B)}`;
			case LuaOpcode.OP_GETTABUP:
				return `GETTABUP  ${this.getRegisterLabel(pc, current.A)} := ${this.getUpvalLabel(current.B)}[${this.getRegisterOrConstantLabel(pc, current.C)}]`;
			case LuaOpcode.OP_GETTABLE:
				return `GETTABLE  ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.B)}[${this.getRegisterOrConstantLabel(pc, current.C)}]`;
			case LuaOpcode.OP_SETTABUP:
				return `SETTABUP  ${this.getUpvalLabel(current.A)}[${this.getRegisterOrConstantLabel(pc, current.B)}] := ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_SETUPVAL:
				return `SETUPVAL  ${this.getUpvalLabel(current.B)} := ${this.getRegisterLabel(pc, current.A)}`;
			case LuaOpcode.OP_SETTABLE:
				return `SETTABLE  ${this.getRegisterLabel(pc, current.A)}[${this.getRegisterOrConstantLabel(pc, current.B)}] := ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_NEWTABLE:
			{
				const rawb = current.B;
				const b = this.fb2int(rawb);
				const rawc = current.C;
				const c = this.fb2int(rawc);
				const asize = rawb===b?`${b}`:`${rawb}->${b}`;
				const hsize = rawc===c?`${c}`:`${rawc}->${c}`;
				return `NEWTABLE  ${this.getRegisterLabel(pc, current.A)} := {} size(${asize},${hsize})`;
			}
			case LuaOpcode.OP_SELF:
				return `SELF      ${this.getRegisterLabel(pc, current.A+1)} := ${this.getRegisterLabel(pc, current.B)}; ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.B)}[${this.getRegisterOrConstantLabel(pc, current.C)}]`;

			case LuaOpcode.OP_ADD:
				return `ADD       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} + ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_SUB:
				return `SUB       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} - ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_MUL:
				return `MUL       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} * ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_DIV:
				return `DIV       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} / ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_MOD:
				return `MOD       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} % ${this.getRegisterOrConstantLabel(pc, current.C)}`;
			case LuaOpcode.OP_POW:
				return `POW       ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterOrConstantLabel(pc, current.B)} ^ ${this.getRegisterOrConstantLabel(pc, current.C)}`;

			case LuaOpcode.OP_MOVE:
				return `MOVE      ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.B)}`;
			case LuaOpcode.OP_UNM:
				return `UNM       ${this.getRegisterLabel(pc, current.A)} := -${this.getRegisterLabel(pc, current.B)}`;
			case LuaOpcode.OP_NOT:
				return `NOT       ${this.getRegisterLabel(pc, current.A)} := not ${this.getRegisterLabel(pc, current.B)}`;
			case LuaOpcode.OP_LEN:
				return `LEN       ${this.getRegisterLabel(pc, current.A)} := length of ${this.getRegisterLabel(pc, current.B)}`;

			case LuaOpcode.OP_CONCAT:
				return `CONCAT    ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.B)}.. ... ..${this.getRegisterLabel(pc, current.C)}`;

			case LuaOpcode.OP_JMP:
				return `JMP       pc+=${current.sBx}${current.A?`; close >= ${current.A-1}`:""}`;

			case LuaOpcode.OP_EQ:
				return `EQ        if(${this.getRegisterOrConstantLabel(pc, current.B)} ${current.A?"~=":"=="} ${this.getRegisterOrConstantLabel(pc, current.B)}) then pc++`;
			case LuaOpcode.OP_LT:
				return `LT        if(${this.getRegisterOrConstantLabel(pc, current.B)} ${current.A?">=":"<"} ${this.getRegisterOrConstantLabel(pc, current.B)}) then pc++`;
			case LuaOpcode.OP_LE:
				return `LE        if(${this.getRegisterOrConstantLabel(pc, current.B)} ${current.A?">":"<="} ${this.getRegisterOrConstantLabel(pc, current.B)}) then pc++`;

			case LuaOpcode.OP_TEST:
				return `TEST      if ${current.C?"not ":""}${this.getRegisterLabel(pc, current.A)} then pc++`;
			case LuaOpcode.OP_TESTSET:
				return `TESTSET   if ${current.C?"":"not "}${this.getRegisterLabel(pc, current.A)} then ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.B)} else pc++`;

			case LuaOpcode.OP_CALL:
				return `CALL      ${this.getRegisterLabel(pc, current.A)}(${current.B?current.B-1:"var"} args ${current.C?current.C-1:"var"} returns)`;

			case LuaOpcode.OP_TAILCALL:
				return `TAILCALL  return ${this.getRegisterLabel(pc, current.A)}(${current.B?current.B-1:"var"} args)`;

			case LuaOpcode.OP_RETURN:
				return `RETURN    return ${current.B?current.B-1:"var"} results ${current.B>1?`starting at ${this.getRegisterLabel(pc, current.A)}`:""}`;

			case LuaOpcode.OP_FORLOOP:
				return `FORLOOP   ${this.getRegisterLabel(pc, current.A)} += ${this.getRegisterLabel(pc, current.A+2)}; if ${this.getRegisterLabel(pc, current.A)} <= ${this.getRegisterLabel(pc, current.A+1)} then { pc+=${current.sBx}; ${this.getRegisterLabel(pc, current.A+3)} := ${this.getRegisterLabel(pc, current.A)} }`;
			case LuaOpcode.OP_FORPREP:
				return `FORPREP   ${this.getRegisterLabel(pc, current.A)} -= ${this.getRegisterLabel(pc, current.A+2)}; pc += ${current.sBx}`;

			case LuaOpcode.OP_TFORCALL:
				return `TFORCALL  ${this.getRegisterLabel(pc, current.A+3)}...${this.getRegisterLabel(pc, current.A+2+current.C)} := ${this.getRegisterLabel(pc, current.A)}(${this.getRegisterLabel(pc, current.A+1)},${this.getRegisterLabel(pc, current.A+2)})`;
			case LuaOpcode.OP_TFORLOOP:
				return `TFORLOOP  if ${this.getRegisterLabel(pc, current.A+1)} ~= nil then { ${this.getRegisterLabel(pc, current.A)} := ${this.getRegisterLabel(pc, current.A+1)}; pc += ${current.sBx} }`;

			case LuaOpcode.OP_SETLIST:
				let C = current.C - 1;
				if (!current.C) {
					if (!next) { throw new Error("Invalid PC"); }
					C = next.Ax - 1;
				}
				const FPF = 50;
				return `SETLIST   ${this.getRegisterLabel(pc, current.A)}[${(C*FPF)+1}...${(current.B?(C*FPF)+current.B:"")}] := ${this.getRegisterLabel(pc, current.A+1)}...${current.B?this.getRegisterLabel(pc, current.A+current.B):"top"}`;

			case LuaOpcode.OP_CLOSURE:
				const func = this.inner_functions[current.Bx];
				return `CLOSURE   ${this.getRegisterLabel(pc, current.A)} := closure(${func.source}:${func.firstline}-${func.lastline})`;

			case LuaOpcode.OP_VARARG:
				return `VARARG    ${this.getRegisterLabel(pc, current.A)}...${current.B?this.getRegisterLabel(pc, current.A+current.B-2):"top"}`;
			case LuaOpcode.OP_EXTRAARG:
				return `EXTRAARG`;

			default:
				return `UNKNOWN   OP(${current.Op}) A(${current.A}) B(${current.B}) C(${current.C})`;
		}
	}

	// sizes in newtable are packed into a "float byte" type for expanded range:
	// (eeeeexxx), where the real value is (1xxx) * 2^(eeeee - 1) if
	// eeeee != 0 and (xxx) otherwise.
	private fb2int(x:number):number {
		const e = (x>>3)&0x1f;
		return e===0?x:(((x&7)+8)<<(e-1));
	}


	private getRegisterOrConstantLabel(pc:number, idx:number) {
		if (idx & 0x100) {
			return this.constants[idx & 0xff].label;
		} else {
			return this.getRegisterLabel(pc, idx);
		}
	}

	private getUpvalLabel(idx:number) : string {
		return `Up(${this.upvals[idx]?.name ?? idx})`;
	}

	private getRegisterLabel(pc:number, idx:number) : string {
		let stack = 0;
		for (let i = 0; i < this.locals.length; i++) {
			const loc = this.locals[i];
			if (loc.start <= pc+1) {
				if (loc.end >= pc+1) {
					if (stack === idx ) {
						return `R(${loc.name})`;
					}
					stack++;
				}
			} else {
				break;
			}
		}
		return `R(${idx})`;
	}

}