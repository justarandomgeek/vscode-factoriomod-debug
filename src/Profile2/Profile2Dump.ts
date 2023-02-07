export interface LineHookEvent {
	readonly event: "line"
	readonly line: number
	readonly time: number
}

export interface CallHookEvent {
	readonly event: "call"|"tail call"
	readonly source: string
	readonly linedefined: number
	readonly name?: string
	readonly time: number
}

export interface ReturnHookEvent {
	readonly event: "return"
	readonly time: number
}

export type HookEvent = LineHookEvent | CallHookEvent | ReturnHookEvent;

export interface Profile2Dump {
	readonly modname:string
	readonly events: HookEvent[]
}

function parseTime(time:string) {
	// find the number in the middle of this string, regardless of locale...
	const match = time.match(/([0-9.]+)/);
	if (!match) { throw new Error("Missing time in timer"); }
	return Number(match[1]);
}

export function parseProfile2Dump(data:string):Profile2Dump {
	const lines = data.split("\n");
	const match = lines[0].match(/^PROFILE2\x01(.+)\r?$/);
	if (!match) { throw new Error("Missing modname in PROFILE2"); }
	const modname = match[1];

	const events:HookEvent[] = [];
	// already read first line
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		const parts = line.split("\x01");
		switch (parts[1]) {
			case "call":
			case "tail call":
				events.push({
					event: parts[1],
					source: parts[2],
					linedefined: Number(parts[3]),
					name: parts[4],
					time: i===1 ? 0 : parseTime(parts[5]),
				});
				break;
			case "line":
				events.push({
					event: "line",
					line: Number(parts[2]),
					time: parseTime(parts[3]),
				});
				break;
			case "return":
				events.push({
					event: "return",
					time: parseTime(parts[2]),
				});
				break;
		}
	}
	return { modname, events };
}