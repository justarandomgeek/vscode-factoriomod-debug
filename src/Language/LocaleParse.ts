
import type { Processor } from "unified";
import type { Section, Root, Record } from "./LocaleAST";

function parseMacrosAndParams(value:string, line:number, startcol:number): Record["children"] {

	return [
		//TODO: parse text
		{
			type: "text",
			value: value,
			position: {
				start: { line: line, column: startcol },
				end: { line: line, column: startcol+value.length },
			},
		},
	];
}

export default function LocaleParse(this:Processor):void {
	this.Parser = function(doc) {

		const root:Root = {
			type: "root",
			children: [],
		};
		let open_section:Section|undefined;
		const lines = doc.split(/\n/);
		root.position = {
			start: { line: 1, column: 1 },
			end: { line: lines.length, column: lines[lines.length-1].length+1 },
		};
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// blank lines and comments
			if (line.match(/^[\r\t ]*([#;].*)?$/)) {
				continue;
			}

			const section = line.match(/^([\r\t ]*\[)(.*?)\][\r\t ]*$/);
			if (section) {
				open_section = {
					type: "section",
					value: section[2],
					children: [],
					position: {
						// include the brackets
						start: { line: i+1, column: section[1].length },
						end: { line: i+1, column: section[1].length+section[2].length+2 },
					},
				};
				root.children.push(open_section);
				continue;
			}

			const record = line.match(/^(.*?)=(.*)$/);
			if (record) {
				(open_section??root).children.push({
					type: "record",
					value: record[1],
					children: parseMacrosAndParams(record[2], i+1, record[1].length+2),
					position: {
						start: { line: i+1, column: 1 },
						end: { line: i+1, column: line.length+1 },
					},
				});
				continue;
			}

			root.children.push({
				type: "error",
				value: line,
				position: {
					start: { line: i+1, column: 1 },
					end: { line: i+1, column: line.length+1 },
				},
			});
		}

		return root;
	};
}