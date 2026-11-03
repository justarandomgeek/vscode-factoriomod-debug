import type { Plan, Result, EventLog} from "tap-parser";
import assert from 'assert';
import type * as vscode from 'vscode';

export function tapToTestItems(tap: EventLog, item: vscode.TestItem, run:vscode.TestRun, newChild: (parent:vscode.TestItem, id:string, label:string)=>vscode.TestItem) {
	for (let i = 0; i < tap.length; i++) {
		const tapEvent = tap[i];
		switch (tapEvent[0]) {
			case "plan":
				const plan = tapEvent[1] as Plan;
				break;
			case "child":
				{
					const child = tapEvent[1] as EventLog;
					const subTest = tap[++i];
					assert(subTest[0] === "assert");
					const result = subTest[1] as Result;
					const tapItem = newChild(item, result.id.toString(), result.name);
					tapToTestItems(child, tapItem, run, newChild);

					if (result.ok) {
						run.passed(tapItem);
					} else {
						run.failed(tapItem, { message: "" });
					}
				}
				break;
			case "assert":
				{
					const result = tapEvent[1] as Result;

					const tapItem = newChild(item, result.id.toString(), result.name);
					if (result.ok) {
						run.passed(tapItem);
					} else {
						run.failed(tapItem, { message: "" });
					}
				}
				break;
			default:
				break;
		}
	}
}