import * as vscode from "vscode";
import { EventEmitter } from "events";

function NaN_safe_max(a:number,b:number):number {
	if (isNaN(a)) { return b; }
	if (isNaN(b)) { return a; }
	return Math.max(a,b);
}

/*
profile data
	total time in all lua
	modname -> mod data
		total time in lua state
		filename -> file data
			linedefined -> function data
				timer
				count
			line -> line data
				timer
				count
	query for:

*/

class TimerAndCount {
	timer = 0;
	count = 0;

	public add(other:TimerAndCount|undefined):TimerAndCount
	{
		if(!other)
		{
			return this;
		}

		let tc = new TimerAndCount();
		tc.timer = this.timer+other.timer;
		tc.count = this.count+other.count;
		return tc;
	}

	public avg()
	{
		return this.timer/this.count;
	}
}

class ProfileFileData {
	functions = new Map<number,TimerAndCount>();
	lines = new Map<number,TimerAndCount>();

	add(file:ProfileFileData):void
	{
		file.functions.forEach((fn,line)=>{
			this.functions.set(line,fn.add(this.functions.get(line)));
		});
		file.lines.forEach((ln,line)=>{
			this.lines.set(line,ln.add(this.lines.get(line)));
		});

	}

	max()
	{
		let max = {
			func: {timer:0.0,count:0,average:0.0},
			line: {timer:0.0,count:0,average:0.0},
		};

		this.functions.forEach(fn=>{
			max.func.timer = NaN_safe_max(max.func.timer,fn.timer);
			max.func.count = NaN_safe_max(max.func.count,fn.count);
			max.func.average = NaN_safe_max(max.func.average,fn.avg());
		});
		this.lines.forEach(ln=>{
			max.line.timer = NaN_safe_max(max.line.timer,ln.timer);
			max.line.count = NaN_safe_max(max.line.count,ln.count);
			max.line.average = NaN_safe_max(max.line.average,ln.avg());
		});

		return max;
	}
}

class ProfileModData {
	totalTime:number = 0;
	file = new Map<string,ProfileFileData>();
}


interface FlameTreeNode {
	name:string
	value:number
	children:FlameTreeNode[]
	filename?:string
	line?:number
}

class ProfileTreeNode {
	readonly name:string;	// modname or file:line
	value:number;	// time
	private children:ProfileTreeNode[] = [];
	private parent?:ProfileTreeNode;
	readonly filename?:string;
	readonly line?:number;

	constructor(name:string,value:number,parent?:ProfileTreeNode,filename?:string,line?:number)
	{
		this.name = name;
		this.value = value;
		this.parent = parent;
		this.filename = filename;
		this.line = line;
	}

	ToFlameTreeNode():FlameTreeNode
	{
		return {
			name:this.name,
			value:this.value,
			filename:this.filename,
			line:this.line,
			children:this.children.map(ptn=>ptn.ToFlameTreeNode()),
		};
	}


	private ToStringInner(pad:string):string
	{
		return `${pad}${this.name} : ${this.value}\n${this.children.map(ptn=>ptn.ToStringInner(pad+" ")).join("\n")}`;
	}

	ToString():string
	{
		return this.ToStringInner("");
	}

	AddToChild(name:string,value:number,filename?:string,line?:number):ProfileTreeNode
	{
		let childnode = this.children.find(n=>n.name === name);
		if (childnode)
		{
			childnode.value += value;
		}
		else
		{
			childnode = new ProfileTreeNode(name,value,this,filename,line);
			this.children.push(childnode);
		}
		return childnode;
	}

	Merge(other:ProfileTreeNode)
	{
		this.value += other.value;
		other.children.forEach(otherchild=>{
			const thischild = this.children.find(ptn=>ptn.name === otherchild.name);
			if (thischild)
			{
				thischild.Merge(otherchild);
			}
			else
			{
				otherchild.parent = this;
				this.children.push(otherchild);
			}
		});
	}

	GetParent()
	{
		return this.parent;
	}
}

class ProfileData {
	private totalTime:number = 0;
	private mod = new Map<string,ProfileModData>();

	private getMod(modname:string)
	{
		let mod = this.mod.get(modname);
		if (!mod)
		{
			mod = new ProfileModData();
			this.mod.set(modname,mod);
		}
		return mod;
	}

	private getFile(modname:string,filename:string)
	{
		const mod = this.getMod(modname);
		let file = mod.file.get(filename);
		if (!file)
		{
			file = new ProfileFileData();
			mod.file.set(filename,file);
		}
		return file;
	}

	AddModTime(modname:string,modtime:number)
	{
		this.totalTime += modtime;
		this.getMod(modname).totalTime+=modtime;
	}

	AddLineTime(modname:string,filename:string,line:number,time:number,count:number)
	{
		const file = this.getFile(modname,filename);
		let linedata = file.lines.get(line);
		if (!linedata)
		{
			linedata = new TimerAndCount();
			file.lines.set(line,linedata);
		}
		linedata.count+=count;
		linedata.timer+=time;
	}

	AddFuncTime(modname:string,filename:string,linedefined:number,time:number,count:number)
	{
		const file = this.getFile(modname,filename);
		let funcdata = file.functions.get(linedefined);
		if (!funcdata)
		{
			funcdata = new TimerAndCount();
			file.functions.set(linedefined,funcdata);
		}
		funcdata.count+=count;
		funcdata.timer+=time;
	}



	Report(filename:string)
	{

		let filedata = new ProfileFileData();

		this.mod.forEach(mod=>{
			let file = mod.file.get(filename);
			if (file)
			{
				filedata.add(file);
			}
		});


		return {
			totalTime: this.totalTime,
			fileData: filedata,
			// line[int] -> count,time
			// function[int] -> count,time
			// max ->
			//   line -> count,time
			//   func -> count,time
		};
	}
}




export class Profile extends EventEmitter implements vscode.Disposable  {
	private profileData = new ProfileData();
	private profileTreeRoot = new ProfileTreeNode("root",0);

	private profileOverhead = new TimerAndCount();
	private timeDecorationType: vscode.TextEditorDecorationType;
	private funcDecorationType: vscode.TextEditorDecorationType;
	private rulerDecorationTypes: {type:vscode.TextEditorDecorationType;threshold:number}[];
	private statusBar: vscode.StatusBarItem;
	private flamePanel?: vscode.WebviewPanel;

	constructor()
	{
		super();
		this.timeDecorationType = vscode.window.createTextEditorDecorationType({
			before: {
				contentText:"",
				color: new vscode.ThemeColor("factorio.ProfileTimerForeground"),
			}
		});
		this.funcDecorationType = vscode.window.createTextEditorDecorationType({
			after: {
				contentText: "",
				color: new vscode.ThemeColor("factorio.ProfileFunctionTimerForeground"),
				borderColor: new vscode.ThemeColor("factorio.ProfileFunctionTimerForeground"),
				border: "1px solid",
				margin: "0 0 0 3ch",
			},
		});

		let rulers = vscode.workspace.getConfiguration().get<{color?:string;themeColor?:string;threshold:number;lane?:string}[]>("factorio.profile.rulers",[]);
		this.rulerDecorationTypes = rulers.filter(ruler=>{return ruler.color || ruler.themeColor;}).map(ruler=>{
			let lane = vscode.OverviewRulerLane.Right;
			switch (ruler.lane) {
				case "Right":
					lane = vscode.OverviewRulerLane.Right;
					break;
				case "Center":
					lane = vscode.OverviewRulerLane.Center;
					break;
				case "Left":
					lane = vscode.OverviewRulerLane.Left;
					break;
				case "Full":
					lane = vscode.OverviewRulerLane.Full;
					break;
				default:
					break;
			}
			return {
				type: vscode.window.createTextEditorDecorationType({
					overviewRulerColor: ruler.color ?? new vscode.ThemeColor(ruler.themeColor!),
					overviewRulerLane: lane,
				}),
				threshold: ruler.threshold
			};
		});
		this.statusBar = vscode.window.createStatusBarItem();
		this.createFlamePanel();
	}

	dispose() {
		this.timeDecorationType.dispose();
		this.funcDecorationType.dispose();
		this.rulerDecorationTypes.forEach(ruler=>{ruler.type.dispose();});
		this.statusBar.dispose();
		if (this.flamePanel){
			this.flamePanel.dispose();
		}
	}

	private createFlamePanel()
	{
		if (this.flamePanel)
		{
			return;
		}

		const ext = vscode.extensions.getExtension("justarandomgeek.factoriomod-debug")!;

		this.flamePanel = vscode.window.createWebviewPanel(
			'factorioProfile',
			'Factorio Profile',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				localResourceRoots: [ ext.extensionUri ],
			}
		);
		const flameview = this.flamePanel.webview;
		flameview.html =
`<!DOCTYPE html>
<html lang="en">
<head>
	<link rel="stylesheet" type="text/css" href="${flameview.asWebviewUri(vscode.Uri.joinPath(ext.extensionUri,"node_modules/d3-flame-graph/dist/d3-flamegraph.css"))}">
</head>
<body>
	<div id="chart"></div>
	<script type="text/javascript" src="${flameview.asWebviewUri(vscode.Uri.joinPath(ext.extensionUri,"node_modules/d3/dist/d3.js"))}"></script>
	<script type="text/javascript" src="${flameview.asWebviewUri(vscode.Uri.joinPath(ext.extensionUri,"node_modules/d3-flame-graph/dist/d3-flamegraph.js"))}"></script>
	<script type="text/javascript">
	const vscode = acquireVsCodeApi();
	var chart = flamegraph().height(window.innerHeight-20).width(window.innerWidth-60);
	chart.label(function(d){
		return d.data.name + ' (' + ((100 * (d.x1 - d.x0))??0).toFixed(3) + '%, ' + (d.value??0).toFixed(3) + ' ms)'
	});
	var treeData = {
		"name":"root",
		"value":0,
		"children":[]
	};
	d3.select("#chart").datum(treeData).call(chart);

	chart.onClick(function (d) {
		vscode.postMessage({
			command: 'click',
			name: d.data.name,
			filename: d.data.filename,
			line: d.data.line,
		});
	});

	window.addEventListener('message', event => {
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
	vscode.postMessage({command: 'init'});
	</script>
</body>
</html>
`;
		flameview.onDidReceiveMessage(
			(mesg:{command:"init"}|{command:"click";name:string;filename?:string;line?:number})=>{
			switch (mesg.command) {
				case "init":
					flameview.postMessage({command:"update",data:this.profileTreeRoot.ToFlameTreeNode()});
					break;
				case "click":
					if(mesg.line && mesg.line > 0)
					{
						this.emit("flameclick", mesg);
					}
					break;
				default:
					break;
			}
		});
		this.flamePanel.onDidDispose(()=>this.flamePanel=undefined);
	}

	public parse(profile:string)
	{
		const lines = profile.split("\n");
		let currmod:string;
		let currfile:string;
		let profileTreeRoot = new ProfileTreeNode("root",0);
		let currnode:ProfileTreeNode|undefined;
		lines.forEach(line => {
			const parts = line.split(":");
			switch(parts[0])
			{
				case "PROFILE": // nothing
					break;
				case "PMN": // PMN:modname:label: time
					{
						currmod = parts[1].replace(/[\r\n]*/g,"");
						const time = parseFloat(parts[3]);
						this.profileData.AddModTime(currmod,time);
					}
					break;
				case "PFN": // PFN:filename
					if (currmod)
					{
						currfile = parts[1].replace(/[\r\n]*/g,"");
					}
					break;
				case "PLN": // PLN:line:label: time:count
					if (currmod && currfile)
					{
						const line = parseInt(parts[1]);
						const time = parseFloat(parts[3]);
						const count = parseInt(parts[4]);
						this.profileData.AddLineTime(currmod,currfile,line,time,count);
					}
					break;
				case "PFT": // PFT:line:label: time:count
					if (currmod && currfile)
					{
						const line = parseInt(parts[1]);
						const time = parseFloat(parts[3]);
						const count = parseInt(parts[4]);
						this.profileData.AddFuncTime(currmod,currfile,line,time,count);
					}
					break;
				case "POV": //POV:label: time
					{
						const time =  parseFloat(parts[2]);
						this.profileOverhead.timer += time;
						this.profileOverhead.count += 1;
					}
					break;
				case "PROOT":
					if (currmod)
					{
						currnode = profileTreeRoot.AddToChild(currmod,0);
					}
					break;
				case "PTREE": // PTREE:funcname:filename:line:label: time
					if (currnode)
					{
						const funcname = parts[1];
						const filename = parts[2];
						const line = parts[3];
						const nodename = funcname + ":" + filename + ":" + line;
						const time =  parseFloat(parts[5]);
						currnode = currnode.AddToChild(nodename,time,filename,parseInt(line));
					}
					break;
				case "PTEND":
					if (currnode)
					{
						currnode = currnode.GetParent();
					}
					break;
			}
		});

		if (this.flamePanel && this.flamePanel.visible)
		{
			this.flamePanel.webview.postMessage({command:"merge",data:profileTreeRoot.ToFlameTreeNode()});
		}
		this.profileTreeRoot.Merge(profileTreeRoot);
	}

	public render(editor:vscode.TextEditor,filename:string)
	{

		const report = this.profileData.Report(filename);
		const reportmax = report.fileData.max();

		const maxtime = reportmax.line.timer;
		const maxavg = reportmax.line.average;
		const maxcount = reportmax.line.count;

		let linedecs = new Array<vscode.DecorationOptions>();
		let funcdecs = new Array<vscode.DecorationOptions>();
		let rulerthresholds = this.rulerDecorationTypes.map((ruler,i)=>{
			return {
				type: ruler.type,
				threshold: ruler.threshold,
				decs: new Array<vscode.DecorationOptions>()
			};
		});
		const displayAverageTime = vscode.workspace.getConfiguration().get("factorio.profile.displayAverageTime");
		const colorBy = vscode.workspace.getConfiguration().get<"count"|"totaltime"|"averagetime">("factorio.profile.colorBy","totaltime");

		const highlightColor = vscode.workspace.getConfiguration().get("factorio.profile.timerHighlightColor");
		const scalemax = {"count": maxcount, "totaltime":maxtime, "averagetime":maxavg }[colorBy];
		const colorScaleFactor = Math.max(Number.MIN_VALUE, vscode.workspace.getConfiguration().get<number>("factorio.profile.colorScaleFactor",1));
		const scale = {
			"boost": (x:number)=>{return Math.log1p(x*colorScaleFactor)/Math.log1p(scalemax*colorScaleFactor);},
			"linear": (x:number)=>{return x/scalemax;},
			"mute": (x:number)=>{return (Math.pow(1+scalemax,(x*colorScaleFactor)/scalemax)-1)/(scalemax*colorScaleFactor);},
		}[vscode.workspace.getConfiguration().get<"boost"|"linear"|"mute">("factorio.profile.colorScaleMode","boost")];

		const countwidth = maxcount.toFixed(0).length+1;
		const timeprecision = displayAverageTime ? 6 : 3;
		const timewidth = maxtime.toFixed(timeprecision).length+1;
		const width = countwidth+timewidth+3;

		const haslines = report.fileData.lines.size > 0;
		const hasfuncs = report.fileData.functions.size > 0;

		for (let line = 1; line <= editor.document.lineCount; line++) {
			if (haslines)
			{
				const linetc = report.fileData.lines.get(line);
				if (linetc)
				{
					const time = linetc.timer;
					const count = linetc.count;
					const displayTime = displayAverageTime ? linetc.avg() : time;
					const t = scale({"count": count, "totaltime":time, "averagetime":linetc.avg() }[colorBy]);
					const range = editor.document.validateRange(new vscode.Range(line-1,0,line-1,1/0));
					linedecs.push({
						range: range,
						hoverMessage: displayAverageTime ? `total: ${time}` : `avg: ${linetc.avg()}`,
						renderOptions: {
							before: {
								backgroundColor: `${highlightColor}${Math.floor(255*t).toString(16)}`,
								contentText: `${count.toFixed(0).padStart(countwidth,"\u00A0")}${displayTime.toFixed(timeprecision).padStart(timewidth,"\u00A0")}\u00A0ms`,
								width: `${width+1}ch`,
							}
						}

					});
					let ruler = rulerthresholds.find(ruler=>{return t >= ruler.threshold;});
					if (ruler)
					{
						ruler.decs.push({
							range: range,
						});
					}
				}
				else
				{
					linedecs.push({
						range: editor.document.validateRange(new vscode.Range(line-1,0,line-1,1/0)),
						renderOptions: {
							before: {
								width: `${width+1}ch`,
							}
						}
					});
				}
			}

			if (hasfuncs)
			{
				const functc = report.fileData.functions.get(line);
				if (functc)
				{
					const time = functc.timer;
					const count = functc.count;
					const displayTime = displayAverageTime ? functc.avg() : time;
					const range = editor.document.validateRange(new vscode.Range(line-1,0,line-1,1/0));
					funcdecs.push({
						range: range,
						renderOptions: {
							after: {
								contentText: `\u00A0${count.toFixed(0)}\u00A0|\u00A0${displayTime.toFixed(timeprecision)}\u00A0ms\u00A0`,

								// have to repeat some properties here or gitlens will win when we both try to render on the same line
								color: new vscode.ThemeColor("factorio.ProfileFunctionTimerForeground"),
								borderColor: new vscode.ThemeColor("factorio.ProfileFunctionTimerForeground"),
								margin: "0 0 0 3ch",
							}
						}
					});
				}
			}
		}

		editor.setDecorations(this.timeDecorationType,linedecs);
		editor.setDecorations(this.funcDecorationType,funcdecs);

		rulerthresholds.forEach((ruler)=>{
			editor.setDecorations(ruler.type,ruler.decs);
		});
		this.statusBar.text = `Profile Dump Avg ${this.profileOverhead.avg().toFixed(3)} ms`;
		this.statusBar.show();
	}

	public clear()
	{
		vscode.window.visibleTextEditors.forEach(editor => {
			editor.setDecorations(this.timeDecorationType,[]);
			editor.setDecorations(this.funcDecorationType,[]);
			this.rulerDecorationTypes.forEach(ruler=>{
				editor.setDecorations(ruler.type,[]);
			});
		});
		this.statusBar.hide();
	}
}