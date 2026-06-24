export function luaBlockQuote(inbuff:Buffer) {
	const tailmatch = inbuff.toString().match(/\]=*$/);
	const blockpad = "=".repeat((inbuff.toString().match(/\]=*\]/g)||[])
		.map((matchstr)=>{ return matchstr.length - 1; })
		.reduce((prev, curr)=>{ return Math.max(prev, curr); },
		// force extra pad if the string ends with a square bracket followed by zero or more equals
		// as it will be confused with the close bracket
			tailmatch ? tailmatch[0].length : 0));

	return Buffer.concat([Buffer.from(`[${blockpad}[`), inbuff, Buffer.from(`]${blockpad}]`) ]);
}

export function luaEscapeQuote(str:string) {
	return `"${str.replaceAll(/[\x00-\x1f'"\\]/gm, (s)=>{
		switch (s) {
			case "\t":
				return "\\t";
			case "\r":
				return "\\r";
			case "\n":
				return "\\n";
			case "'":
				return "\\'";
			case '"':
				return '\\"';
			case "\\":
				return "\\\\";

			default:
				return `\\x${(s.codePointAt(0) ?? 0).toString(16).padStart(2, '0')}`;
		}
	})}"`;
}

export type LuaConvertableObject = string|number|boolean|{[k:string]:LuaConvertableObject}|LuaConvertableObject[];

export function objectToLua(obj:LuaConvertableObject) {
	switch (typeof obj) {
		case 'object':
			if (Array.isArray(obj)) {
				const b = [Buffer.from("{")];
				for (const element of obj) {
					b.push(objectToLua(element));
					b.push(Buffer.from(","));
				}
				b.push(Buffer.from("}"));
				return Buffer.concat(b);
			} else {
				const b = [Buffer.from("{")];
				for (const key in obj) {
					if (Object.prototype.hasOwnProperty.call(obj, key)) {
						b.push(Buffer.from("["));
						b.push(objectToLua(key));
						b.push(Buffer.from("]="));
						b.push(objectToLua(obj[key]));
						b.push(Buffer.from(","));
					}
				}
				b.push(Buffer.from("}"));
				return Buffer.concat(b);
			}
		case 'string':
			return Buffer.from(luaEscapeQuote(obj));
		case 'boolean':
		case 'number':
			return Buffer.from(`${obj}`);
	}
}
