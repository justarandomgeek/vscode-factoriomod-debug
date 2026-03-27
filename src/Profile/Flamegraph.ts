import * as d3 from "d3";
//@ts-expect-error missing type
import { default as flamegraph } from "d3-flame-graph";
import type { ProfileTreeNode } from "./Profile";
import "./Flamegraph.css";
import type {} from "vscode-webview";

const vscode = acquireVsCodeApi();
const chart = flamegraph().height(window.innerHeight - 20).width(window.innerWidth - 60);
chart.setLabelHandler(function (d:any) {
	return `${d.data.name} (${(100 * (d.x1 - d.x0)).toFixed(3)}%, ${d.value.toFixed(3)} ms)`;
});
const treeData = {
	"name": "root",
	"value": 0,
	"children": [],
};
d3.select("#chart").datum(treeData).call(chart);

chart.onClick(function (d:any) {
	vscode.postMessage({
		command: 'click',
		name: d.data.name,
		filename: d.data.filename,
		line: d.data.line,
	});
});

interface EventData {
	command: "update"|"merge"
	data: ProfileTreeNode
};

window.addEventListener('message', (event:{data:EventData})=>{
	const message = event.data;
	switch (message.command) {
		case 'update':
			chart.update(message.data);
			break;
		case 'merge':
			chart.merge(message.data);
			break;
	}
});
vscode.postMessage({ command: 'init' });