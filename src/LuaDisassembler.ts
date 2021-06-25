import { BufferStream } from "./BufferStream";

/* eslint-disable no-bitwise */
export enum LuaOpcode {
	OP_MOVE,/*	A B	R(A) := R(B)					*/
	OP_LOADK,/*	A Bx	R(A) := Kst(Bx)					*/
	OP_LOADKX,/*	A 	R(A) := Kst(extra arg)				*/
	OP_LOADBOOL,/*	A B C	R(A) := (Bool)B; if (C) pc++			*/
	OP_LOADNIL,/*	A B	R(A), R(A+1), ..., R(A+B) := nil		*/
	OP_GETUPVAL,/*	A B	R(A) := UpValue[B]				*/

	OP_GETTABUP,/*	A B C	R(A) := UpValue[B][RK(C)]			*/
	OP_GETTABLE,/*	A B C	R(A) := R(B)[RK(C)]				*/

	OP_SETTABUP,/*	A B C	UpValue[A][RK(B)] := RK(C)			*/
	OP_SETUPVAL,/*	A B	UpValue[B] := R(A)				*/
	OP_SETTABLE,/*	A B C	R(A)[RK(B)] := RK(C)				*/

	OP_NEWTABLE,/*	A B C	R(A) := {} (size = B,C)				*/

	OP_SELF,/*	A B C	R(A+1) := R(B); R(A) := R(B)[RK(C)]		*/

	OP_ADD,/*	A B C	R(A) := RK(B) + RK(C)				*/
	OP_SUB,/*	A B C	R(A) := RK(B) - RK(C)				*/
	OP_MUL,/*	A B C	R(A) := RK(B) * RK(C)				*/
	OP_DIV,/*	A B C	R(A) := RK(B) / RK(C)				*/
	OP_MOD,/*	A B C	R(A) := RK(B) % RK(C)				*/
	OP_POW,/*	A B C	R(A) := RK(B) ^ RK(C)				*/
	OP_UNM,/*	A B	R(A) := -R(B)					*/
	OP_NOT,/*	A B	R(A) := not R(B)				*/
	OP_LEN,/*	A B	R(A) := length of R(B)				*/

	OP_CONCAT,/*	A B C	R(A) := R(B).. ... ..R(C)			*/

	OP_JMP,/*	A sBx	pc+=sBx; if (A) close all upvalues >= R(A) + 1	*/
	OP_EQ,/*	A B C	if ((RK(B) == RK(C)) ~= A) then pc++		*/
	OP_LT,/*	A B C	if ((RK(B) <  RK(C)) ~= A) then pc++		*/
	OP_LE,/*	A B C	if ((RK(B) <= RK(C)) ~= A) then pc++		*/

	OP_TEST,/*	A C	if not (R(A) <=> C) then pc++			*/
	OP_TESTSET,/*	A B C	if (R(B) <=> C) then R(A) := R(B) else pc++	*/

	OP_CALL,/*	A B C	R(A), ... ,R(A+C-2) := R(A)(R(A+1), ... ,R(A+B-1)) */
	OP_TAILCALL,/*	A B C	return R(A)(R(A+1), ... ,R(A+B-1))		*/
	OP_RETURN,/*	A B	return R(A), ... ,R(A+B-2)	(see note)	*/

	OP_FORLOOP,/*	A sBx	R(A)+=R(A+2);
				if R(A) <?= R(A+1) then { pc+=sBx; R(A+3)=R(A) }*/
	OP_FORPREP,/*	A sBx	R(A)-=R(A+2); pc+=sBx				*/

	OP_TFORCALL,/*	A C	R(A+3), ... ,R(A+2+C) := R(A)(R(A+1), R(A+2));	*/
	OP_TFORLOOP,/*	A sBx	if R(A+1) ~= nil then { R(A)=R(A+1); pc += sBx }*/

	OP_SETLIST,/*	A B C	R(A)[(C-1)*FPF+i] := R(A+i), 1 <= i <= B	*/

	OP_CLOSURE,/*	A Bx	R(A) := closure(KPROTO[Bx])			*/

	OP_VARARG,/*	A B	R(A), R(A+1), ..., R(A+B-2) = vararg		*/

	OP_EXTRAARG/*	Ax	extra (larger) argument for previous opcode	*/
}

export enum LuaConstType {
	Nil = 0,
	Boolean = 1,
	Number = 3,
	String = 4,
}

const header = [
	0x1b, 0x4c, 0x75, 0x61, // LUA_SIGNATURE
	0x52, 0x00, // lua version
	0x01, 0x04, 0x08, 0x04, 0x08, 0x00, // lua config parameters: LE, 4 byte int, 8 byte size_t, 4 byte instruction, 8 byte LuaNumber, number is double
	0x19, 0x93, 0x0d, 0x0a, 0x1a, 0x0a, // magic
];

function readHeader(b:BufferStream)
{
	for (let i = 0; i < header.length; i++) {
		const n = b.readUInt8();
		if (n !== header[i])
		{
			throw new Error(`Invalid Lua Header at offset ${i}, expected ${header[i]} got ${n}`);
		}
	}
}

function readLuaString(b:BufferStream)
{
	const size = b.readBigUInt64LE();
	if (size > 0)
	{
		const s = b.readString(Number(size)-1);
		b.readUInt8();
		return s;
	} else {
		return "";
	}
}

/*
|   B   |   C   |   A   |   Op   |
|       Bx      |   A   |   Op   |
|           Ax          |   Op   |
*/
export class LuaInstruction {
	constructor(private readonly raw:number){}

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


	line:number;
}

class LuaUpval {
	name?:string;
	readonly instack:boolean;
	readonly idx:number;

	constructor(b:BufferStream)
	{
		this.instack = b.readUInt8() !== 0;
		this.idx = b.readUInt8();
	}
}

export class LuaLocal {
	readonly name:string;
	readonly start:number;
	readonly end:number;

	constructor(b:BufferStream)
	{
		this.name = readLuaString(b);
		this.start = b.readUInt32LE();
		this.end = b.readUInt32LE();
	}
}

export class LuaConstant {
	public constructor(type:LuaConstType.Nil);
	public constructor(type:LuaConstType.Boolean,value:boolean);
	public constructor(type:LuaConstType.Number,value:number);
	public constructor(type:LuaConstType.String,value:string);
	public constructor(
		public readonly type:LuaConstType,
		public readonly value?:boolean|number|string
	) {
		switch (type) {
			case LuaConstType.Nil:
				if (value !== undefined) {throw new Error(`Invalid Lua Constant: ${type} ${value}`);}
				break;
			case LuaConstType.Boolean:
				if (typeof value !== "boolean") {throw new Error(`Invalid Lua Constant: ${type} ${value}`);}
				break;
			case LuaConstType.Number:
				if (typeof value !== "number") {throw new Error(`Invalid Lua Constant: ${type} ${value}`);}
				break;
			case LuaConstType.String:
				if (typeof value !== "string") {throw new Error(`Invalid Lua Constant: ${type} ${value}`);}
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
				return `"${(<string>this.value)}"`; //TODO: escape strings
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
	readonly instructions:LuaInstruction[]=[];
	readonly constants:LuaConstant[]=[];
	readonly inner_functions:LuaFunction[]=[];
	readonly firstline:number;
	readonly lastline:number;

	constructor(b:BufferStream, withheader?:boolean) {
		if (withheader)
		{
			readHeader(b);
		}
		this.firstline = b.readUInt32LE();
		this.lastline = b.readUInt32LE();
		this.nparam = b.readUInt8();
		this.is_vararg = b.readUInt8() !== 0;
		this.maxstack = b.readUInt8();

		const num_insts = b.readUInt32LE();
		for (let i = 0; i < num_insts; i++) {
			const inst = b.readUInt32LE();
			this.instructions.push(new LuaInstruction(inst));

		}

		const num_const = b.readUInt32LE();
		for (let i = 0; i < num_const; i++) {
			const type:LuaConstType = b.readUInt8();
			switch (type) {
				case LuaConstType.Nil:
					this.constants.push(new LuaConstant(LuaConstType.Nil));
					break;
				case LuaConstType.Boolean:
					this.constants.push(new LuaConstant(LuaConstType.Boolean, b.readUInt8()!==0));
					break;
				case LuaConstType.Number:
					this.constants.push(new LuaConstant(LuaConstType.Number, b.readDoubleLE()));
					break;
				case LuaConstType.String:
					this.constants.push(new LuaConstant(LuaConstType.String, readLuaString(b)));
					break;
				default:
					throw new Error(`Invalid Lua Constant Type: ${type}`);
			}
		}

		const num_protos = b.readUInt32LE();
		for (let i = 0; i < num_protos; i++) {
			this.inner_functions.push(new LuaFunction(b));
		}

		const num_upvals = b.readUInt32LE();
		for (let i = 0; i < num_upvals; i++) {
			this.upvals.push(new LuaUpval(b));
		}

		this.source = readLuaString(b);

		const num_lineinfo = b.readUInt32LE();
		for (let i = 0; i < num_lineinfo; i++) {
			this.instructions[i].line = b.readUInt32LE();
		}

		const num_locals = b.readUInt32LE();
		for (let i = 0; i <  num_locals; i++) {
			this.locals.push(new LuaLocal(b));
		}

		const num_upval_names = b.readUInt32LE();
		for (let i = 0; i < num_upval_names; i++) {
			this.upvals[i].name = readLuaString(b);
		}
	}

	getDisassembledSingleFunction():string {
		const instructions = this.instructions.map((i,pc)=>this.getInstructionLabel(pc));
		return [
			`function at ${this.source}:${this.firstline}-${this.lastline}`,
			`${this.is_vararg?"vararg":`${this.nparam} params`} ${this.upvals.length} upvals ${this.maxstack} maxstack`,
			`${this.instructions.length} instructions ${this.constants.length} constants ${this.inner_functions.length} functions`,
			...instructions,
		].join("\n");
	}

	getDisassembledWholeFile():string {
		return this.getDisassembledSingleFunction() + "\n\n" +
			this.inner_functions.map(f=>f.getDisassembledWholeFile()).join("\n\n");
	}

	getInstructionLabel(pc:number) {
		const current = this.instructions[pc];
		const next = this.instructions[pc+1];
		switch (current.Op) {
			case LuaOpcode.OP_LOADK:
				return `LOADK     [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.constants[current.Bx].label}`;
			case LuaOpcode.OP_LOADKX:
				return `LOADKX    [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.constants[next.Ax].label}`;
			case LuaOpcode.OP_LOADBOOL:
				return `LOADBOOL  [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${current.B!==0}${current.C!==0?" pc++":""}`;
			case LuaOpcode.OP_LOADNIL:
				return `LOADNIL   [${current.line}]\t${this.getRegisterLabel(pc,current.A)}...${this.getRegisterLabel(pc,current.A+current.B)})`;
			case LuaOpcode.OP_GETUPVAL:
				return `GETUPVAL  [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getUpvalLabel(current.B)}`;
			case LuaOpcode.OP_GETTABUP:
				return `GETTABUP  [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getUpvalLabel(current.B)}[${this.getRegisterOrConstantLabel(pc,current.C)}]`;
			case LuaOpcode.OP_GETTABLE:
				return `GETTABLE  [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.B)}[${this.getRegisterOrConstantLabel(pc,current.C)}]`;
			case LuaOpcode.OP_SETTABUP:
				return `SETTABUP  [${current.line}]\t${this.getUpvalLabel(current.A)}[${this.getRegisterOrConstantLabel(pc,current.B)}] := ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_SETUPVAL:
				return `SETUPVAL  [${current.line}]\t${this.getUpvalLabel(current.B)} := ${this.getRegisterLabel(pc,current.B)}`;
			case LuaOpcode.OP_SETTABLE:
				return `SETTABUP  [${current.line}]\t${this.getRegisterLabel(pc,current.A)}[${this.getRegisterOrConstantLabel(pc,current.B)}] := ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_NEWTABLE:
				return `NEWTABLE  [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := {} size(${current.B},${current.C})`;
			case LuaOpcode.OP_SELF:
				return `SELF      [${current.line}]\t${this.getRegisterLabel(pc,current.A+1)} := ${this.getRegisterLabel(pc,current.B)}; ${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.B)}[${this.getRegisterOrConstantLabel(pc,current.C)}]`;

			case LuaOpcode.OP_ADD:
				return `ADD       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} + ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_SUB:
				return `SUB       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} - ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_MUL:
				return `MUL       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} * ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_DIV:
				return `DIV       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} / ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_MOD:
				return `MOD       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} % ${this.getRegisterOrConstantLabel(pc,current.C)}`;
			case LuaOpcode.OP_POW:
				return `POW       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterOrConstantLabel(pc,current.B)} ^ ${this.getRegisterOrConstantLabel(pc,current.C)}`;

			case LuaOpcode.OP_MOVE:
				return `MOVE      [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.B)}`;
			case LuaOpcode.OP_UNM:
				return `UNM       [${current.line}]\t${this.getRegisterLabel(pc,current.A)}:= -${this.getRegisterLabel(pc,current.B)}`;
			case LuaOpcode.OP_NOT:
				return `NOT       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := not ${this.getRegisterLabel(pc,current.B)}`;
			case LuaOpcode.OP_LEN:
				return `LEN       [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := length of ${this.getRegisterLabel(pc,current.B)}`;

			case LuaOpcode.OP_CONCAT:
				return `CONCAT    [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.B)}.. ... ..${this.getRegisterLabel(pc,current.C)}`;

			case LuaOpcode.OP_JMP:
				return `JMP       [${current.line}]\tpc+=${current.sBx}${current.A?`; close >= ${current.A+1}`:""}`;

			case LuaOpcode.OP_EQ:
				return `EQ        [${current.line}]\tif(${this.getRegisterOrConstantLabel(pc,current.B)} ${current.A?"==":"~="} ${this.getRegisterOrConstantLabel(pc,current.B)}) then pc++`;
			case LuaOpcode.OP_LT:
				return `LT        [${current.line}]\tif(${this.getRegisterOrConstantLabel(pc,current.B)} ${current.A?"<":">="} ${this.getRegisterOrConstantLabel(pc,current.B)}) then pc++`;
			case LuaOpcode.OP_LE:
				return `LE        [${current.line}]\tif(${this.getRegisterOrConstantLabel(pc,current.B)} ${current.A?"<=":">"} ${this.getRegisterOrConstantLabel(pc,current.B)}) then pc++`;

			case LuaOpcode.OP_TEST:
				return `TEST      [${current.line}]\tif ${current.C?"":"not "}${this.getRegisterLabel(pc,current.A)} then pc++`;
			case LuaOpcode.OP_TESTSET:
				return `TESTSET   [${current.line}]\tif ${current.C?"not ":""}${this.getRegisterLabel(pc,current.A)} then ${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.B)} else pc++`;

			case LuaOpcode.OP_CALL:
				return `CALL      [${current.line}]\t${this.getRegisterLabel(pc,current.A)}(${current.B?current.B-1:"var"} args ${current.C?current.C-1:"var"} returns)`;

			case LuaOpcode.OP_TAILCALL:
				return `TAILCALL  [${current.line}]\treturn ${this.getRegisterLabel(pc,current.A)}(${current.B?current.B-1:"var"} args)`;

			case LuaOpcode.OP_RETURN:
				return `RETURN    [${current.line}]\treturn ${current.B?current.B-1:"var"} results ${current.B>1?`starting at ${this.getRegisterLabel(pc,current.A)}`:""}`;

			case LuaOpcode.OP_FORLOOP:
				return `FORLOOP   [${current.line}]\t${this.getRegisterLabel(pc,current.A)} += ${this.getRegisterLabel(pc,current.A+2)}; if ${this.getRegisterLabel(pc,current.A)} <= ${this.getRegisterLabel(pc,current.A+1)} then { pc+=${current.sBx}; ${this.getRegisterLabel(pc,current.A+3)} := ${this.getRegisterLabel(pc,current.A)} }`;
			case LuaOpcode.OP_FORPREP:
				return `FORPREP   [${current.line}]\t${this.getRegisterLabel(pc,current.A)} -= ${this.getRegisterLabel(pc,current.A+2)}; pc += ${current.sBx}`;

			case LuaOpcode.OP_TFORCALL:
				return `TFORCALL  [${current.line}]\t${this.getRegisterLabel(pc,current.A+3)}...${this.getRegisterLabel(pc,current.A+2+current.C)} := ${this.getRegisterLabel(pc,current.A)}(${this.getRegisterLabel(pc,current.A+1)},${this.getRegisterLabel(pc,current.A+2)})`;
			case LuaOpcode.OP_TFORLOOP:
				return `TFORLOOP  [${current.line}]\tif ${this.getRegisterLabel(pc,current.A+1)} ~= nil then { ${this.getRegisterLabel(pc,current.A)} := ${this.getRegisterLabel(pc,current.A+1)}; pc += ${current.sBx} }`;

			case LuaOpcode.OP_SETLIST:
				const C = current.C ? current.C - 1 : next.Ax;
				const FPF = 50;
				return `SETLIST   [${current.line}]\t${this.getRegisterLabel(pc,current.A)}[${(C*FPF)+1}...${(C*FPF)+current.B}] := ${this.getRegisterLabel(pc,current.A+1)}...${this.getRegisterLabel(pc,current.A+current.B)}`;

			case LuaOpcode.OP_CLOSURE:
				const func = this.inner_functions[current.Bx];
				return `CLOSURE   [${current.line}]\t${this.getRegisterLabel(pc,current.A)} := closure(${func.source}:${func.firstline}-${func.lastline})`;

			case LuaOpcode.OP_VARARG:
				return `VARARG    [${current.line}]\t${this.getRegisterLabel(pc,current.A)}...${current.B?this.getRegisterLabel(pc,current.A+current.B-2):"top"}`;
			case LuaOpcode.OP_EXTRAARG:
				return `EXTRAARG`;

			default:
				return `UNKNOWN   OP(${current.Op}) A(${current.A}) B(${current.B}) C(${current.C})`;
		}
	}

	getRegisterOrConstantLabel(pc:number, idx:number) {
		if (idx & 0x100)
		{
			return this.constants[idx & 0xff].label;
		} else {
			return this.getRegisterLabel(pc,idx);
		}
	}

	getUpvalLabel(idx:number) : string {
		return `Up(${this.upvals[idx]?.name ?? idx})`;
	}

	getRegisterLabel(pc:number,idx:number) : string {
		let stack = 0;
		for (let i = 0; i < this.locals.length; i++) {
			const loc = this.locals[i];
			if (loc.start <= pc+1)
			{
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