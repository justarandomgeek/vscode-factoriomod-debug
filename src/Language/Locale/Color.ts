import type { Color } from 'vscode-languageclient';

const constColors = new Map<string, Color>([
	["default", { red: 1.000, green: 0.630, blue: 0.259, alpha: 1 }],
	["red", { red: 1.000, green: 0.166, blue: 0.141, alpha: 1 }],
	["green", { red: 0.173, green: 0.824, blue: 0.250, alpha: 1 }],
	["blue", { red: 0.343, green: 0.683, blue: 1.000, alpha: 1 }],
	["orange", { red: 1.000, green: 0.630, blue: 0.259, alpha: 1 }],
	["yellow", { red: 1.000, green: 0.828, blue: 0.231, alpha: 1 }],
	["pink", { red: 1.000, green: 0.520, blue: 0.633, alpha: 1 }],
	["purple", { red: 0.821, green: 0.440, blue: 0.998, alpha: 1 }],
	["white", { red: 0.9, green: 0.9, blue: 0.9, alpha: 1 }],
	["black", { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 }],
	["gray", { red: 0.7, green: 0.7, blue: 0.7, alpha: 1 }],
	["brown", { red: 0.757, green: 0.522, blue: 0.371, alpha: 1 }],
	["cyan", { red: 0.335, green: 0.918, blue: 0.866, alpha: 1 }],
	["acid", { red: 0.708, green: 0.996, blue: 0.134, alpha: 1 }],
]);
export function colorFromString(str: string): Color | undefined {
	// color name from utility constants
	if (constColors.has(str)) { return constColors.get(str); }
	// #rrggbb or #rrggbbaa
	if (str.startsWith("#")) {
		const matches = str.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/);
		if (matches) {
			return {
				red: parseInt(matches[1], 16) / 255,
				green: parseInt(matches[2], 16) / 255,
				blue: parseInt(matches[3], 16) / 255,
				alpha: matches[4] ? parseInt(matches[4], 16) / 255 : 1,
			};
		}
	}
	// r,g,b as int 1-255 or float 0-1
	const matches = str.match(/\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)(?:\s*,?\s*(\d+(?:\.\d+)?))?\s*/);
	if (matches) {
		let r = parseFloat(matches[1]);
		let g = parseFloat(matches[2]);
		let b = parseFloat(matches[3]);
		let a = matches[4] ? parseFloat(matches[4]) : undefined;
		if (r > 1 || g > 1 || b > 1 || a && a > 1) {
			r = r / 255;
			g = g / 255;
			b = b / 255;
			if (a) {
				a = a / 255;
			}
		}
		if (!a) {
			a = 1;
		}
		return { red: r, green: g, blue: b, alpha: a };
	}

	return undefined;
}
function padHex(i: number): string {
	let hex = Math.floor(i).toString(16);
	if (hex.length < 2) {
		hex = "0" + hex;
	}
	return hex;
}
function roundTo(f: number, places: number): number {
	return Math.round(f * Math.pow(10, places)) / Math.pow(10, places);
}
export function colorToStrings(color: Color): string[] {
	const names: string[] = [];
	for (const [constname, constcolor] of constColors) {
		if (Math.abs(constcolor.red - color.red) < 0.004 &&
			Math.abs(constcolor.green - color.green) < 0.004 &&
			Math.abs(constcolor.blue - color.blue) < 0.004 &&
			Math.abs(constcolor.alpha - color.alpha) < 0.004) {
			names.push(constname);
			break;
		}
	}

	if (color.alpha > 0.996) {
		names.push(`#${padHex(color.red * 255)}${padHex(color.green * 255)}${padHex(color.blue * 255)}`);
		names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}`);
		names.push(`${roundTo(color.red, 3)}, ${roundTo(color.green, 3)}, ${roundTo(color.blue, 3)}`);
	} else {
		names.push(`#${padHex(color.red * 255)}${padHex(color.green * 255)}${padHex(color.blue * 255)}${padHex(color.alpha * 255)}`);
		names.push(`${Math.floor(color.red * 255)}, ${Math.floor(color.green * 255)}, ${Math.floor(color.blue * 255)}, ${Math.floor(color.alpha * 255)}`);
		names.push(`${roundTo(color.red, 3)}, ${roundTo(color.green, 3)}, ${roundTo(color.blue, 3)}, ${roundTo(color.alpha, 3)}`);
	}

	return names;
}
