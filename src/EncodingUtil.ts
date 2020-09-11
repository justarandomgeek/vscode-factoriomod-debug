import { DebugProtocol } from 'vscode-debugprotocol';

export function luaBlockQuote(inbuff:Buffer){
	const tailmatch = inbuff.toString().match(/\]=*$/);
	const blockpad = "=".repeat((inbuff.toString().match(/\]=*\]/g)||[])
		.map((matchstr)=>{return matchstr.length - 1;})
		.reduce((prev,curr)=>{return Math.max(prev,curr);},
		// force extra pad if the string ends with a square bracket followed by zero or more equals
		// as it will be confused with the close bracket
		tailmatch ? tailmatch[0].length : 0));

	return Buffer.concat([Buffer.from(`[${blockpad}[`), inbuff, Buffer.from(`]${blockpad}]`) ]);
}

function encodeVarInt(val:number) : Buffer {
	if (val === 10)
	{
		// escape \n
		val = 0xFFFFFFFF;
	} else if (val === 26) {
		val = 0xFFFFFFFE;
	} else if (val === 13) {
		val = 0xFFFFFFFD;
	}
	let prefix: number;
	let firstmask: number;
	let startshift: number;
	let bsize: number;

	if (val < 0x80)
	{
		//[[1 byte]]
		return Buffer.from([val]);
	}
	else if (val < 0x0800)
	{
		//[[2 bytes]]
		bsize = 2;
		prefix = 0xc0;
		firstmask = 0x1f;
		startshift = 6;
	}
	else if (val < 0x10000)
	{
		//[[3 bytes]]
		bsize = 3;
		prefix = 0xe0;
		firstmask = 0x0f;
		startshift = 12;
	}
	else if (val < 0x200000)
	{
		//[[4 bytes]]
		bsize = 4;
		prefix = 0xf0;
		firstmask = 0x07;
		startshift = 18;
	}
	else if (val < 0x4000000)
	{
		//[[5 bytes]]
		bsize = 5;
		prefix = 0xf8;
		firstmask = 0x03;
		startshift = 24;
	}
	else
	{
		//[[6 bytes]]
		bsize = 6;
		prefix = 0xfc;
		firstmask = 0x03;
		startshift = 30;
	}

	let buff = Buffer.alloc(bsize);
	// eslint-disable-next-line no-bitwise
	buff[0] = (prefix|((val>>startshift)&firstmask));
	for (let shift = startshift-6, i=1; shift >= 0; shift -= 6, i++) {
		// eslint-disable-next-line no-bitwise
		buff[i] = (0x80|((val>>shift)&0x3f));
	}
	return buff;
}

function encodeString(strval:string)
{
	const sbuff = Buffer.from(strval,"utf8");
	const slength = encodeVarInt(sbuff.length);
	return Buffer.concat([slength,sbuff]);
}

function encodeBreakpoint(bp: DebugProtocol.SourceBreakpoint) : Buffer {
	let linebuff = encodeVarInt(bp.line);
	let hasExtra = 0;
	let extras = new Array<Buffer>();

	if (bp.condition)
	{
		// eslint-disable-next-line no-bitwise
		hasExtra |= 1;
		extras.push(encodeString(bp.condition.replace("\n"," ")));
	}

	if (bp.hitCondition)
	{
		// eslint-disable-next-line no-bitwise
		hasExtra |= 2;
		extras.push(encodeString(bp.hitCondition.replace("\n"," ")));
	}

	if (bp.logMessage)
	{
		// eslint-disable-next-line no-bitwise
		hasExtra |= 4;
		extras.push(encodeString(bp.logMessage.replace("\n"," ")));
	}

	return Buffer.concat([linebuff,Buffer.from([hasExtra]),Buffer.concat(extras)]);
}

export function encodeBreakpoints(filename:string,breaks:DebugProtocol.SourceBreakpoint[]) : Buffer {
	const fnbuff = encodeString(filename);

	const plainbps = breaks.filter(bp => !bp.condition && !bp.hitCondition && !bp.logMessage).map(bp => bp.line);
	let plainbuff : Buffer;
	if (plainbps.length === 0)
	{
		plainbuff = Buffer.from([0xff]);
	}
	else if (plainbps.length === 10)
	{
		let countbuff = Buffer.from([0xfe]);
		plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => encodeVarInt(line)))]);
	}
	else if (plainbps.length === 26)
	{
		let countbuff = Buffer.from([0xfd]);
		plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => encodeVarInt(line)))]);
	}
	else if (plainbps.length === 13)
	{
		let countbuff = Buffer.from([0xfc]);
		plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => encodeVarInt(line)))]);
	}
	else
	{
		let countbuff = Buffer.from([plainbps.length]);
		plainbuff = Buffer.concat([countbuff,Buffer.concat(plainbps.map(line => encodeVarInt(line)))]);
	}

	const complexbps = breaks.filter(bp => bp.condition || bp.hitCondition || bp.logMessage);
	let complexbuff : Buffer;
	if (complexbps.length === 0)
	{
		complexbuff = Buffer.from([0xff]);
	}
	else if (complexbps.length === 10)
	{
		let countbuff = Buffer.from([0xfe]);
		complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => encodeBreakpoint(bp)))]);
	}
	else if (complexbps.length === 26)
	{
		let countbuff = Buffer.from([0xfd]);
		complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => encodeBreakpoint(bp)))]);
	}
	else if (complexbps.length === 13)
	{
		let countbuff = Buffer.from([0xfc]);
		complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => encodeBreakpoint(bp)))]);
	}
	else
	{
		let countbuff = Buffer.from([complexbps.length]);
		complexbuff = Buffer.concat([countbuff,Buffer.concat(complexbps.map(bp => encodeBreakpoint(bp)))]);
	}

	return Buffer.concat([fnbuff,plainbuff,complexbuff]);
}