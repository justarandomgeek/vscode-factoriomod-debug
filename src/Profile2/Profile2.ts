import type { Profile2Dump } from "./Profile2Dump";

export enum NodeType {
	line,
	call,
	time,
}

// represents a single execution of a line, and the time spent on it
interface LineNode {
	readonly type: NodeType.line
	readonly line: number
	readonly time: number
};

// represents time spent in a function not attributed to a specific line
// from call to first line/subcall, between subcalls in cfunctions, etc
interface TimeNode {
	readonly type: NodeType.time
	readonly time: number
};

// represents a single call to a function
interface CallNode {
	type: NodeType.call
	source: string
	linedefined:number
	name?:string

	children: (LineNode|CallNode|TimeNode)[]
}

interface RootCallNode extends CallNode {
	mod:string
	//TODO: event id or other entrypoint identification?
}

export class Profile2 {
	private calls: RootCallNode[] = [];

	add(dump:Profile2Dump) {
		const root:RootCallNode = {
			type: NodeType.call,
			source: "",
			linedefined: -1,
			mod: dump.modname,
			children: [],
		};
		let rootseen = false;

		let calls:CallNode[]=[];
		let line = NaN;
		function addLineOrTime(time:number) {
			if (!rootseen) { throw new Error("Events before first `call`"); }
			if (isNaN(line)) {
				calls[calls.length-1].children.push({
					type: NodeType.time,
					time,
				});
			} else {
				calls[calls.length-1].children.push({
					type: NodeType.line,
					line,
					time,
				});
			}
		}

		for (const event of dump.events) {
			switch (event.event) {
				case "return":
				//@ts-expect-error fallthrough
				case "tail call":
					addLineOrTime(event.time);
					calls.pop();
					if (event.event==="return") {
						line = NaN;
						break;
					}
				case "call":
					if (!rootseen) {
						rootseen=true;
						root.source = event.source;
						root.linedefined = event.linedefined;
						root.name = event.name;
						calls.push(root);
					} else {
						if (event.event==="call") {
							addLineOrTime(event.time);
						}
						line = NaN;
						const newcall:CallNode = {
							type: NodeType.call,
							source: event.source,
							linedefined: event.linedefined,
							name: event.name,
							children: [],
						};
						calls[calls.length-1].children.push(newcall);
						calls.push(newcall);
					}
					break;
				case "line":
					addLineOrTime(event.time);
					line = event.line;
					break;
			}
		}

		this.calls.push(root);
	}

}