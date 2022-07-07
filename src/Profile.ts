import * as vscode from "vscode";
import { assert } from "console";

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
	constructor(public readonly timer:number = 0,public readonly count:number = 0) {}

	public add(other:TimerAndCount|undefined):TimerAndCount
	{
		if(!other)
		{
			return this;
		}

		return new TimerAndCount(this.timer+other.timer, this.count+other.count);
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
		const max = {
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

class ProfileTreeNode {
	readonly children:ProfileTreeNode[] = [];

	constructor(
		public readonly name:string,	// modname or file:line
		public value:number,			// time
		public readonly filename?:string,
		public readonly line?:number) {}

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
			childnode = new ProfileTreeNode(name,value,filename,line);
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
				this.children.push(otherchild);
			}
		});
	}
}

class ProfileData {
	private totalTime:number = 0;
	private readonly mod = new Map<string,ProfileModData>();

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
		const change = new TimerAndCount(time,count);
		const linedata = file.lines.get(line);
		file.lines.set(line,change.add(linedata));
	}

	AddFuncTime(modname:string,filename:string,linedefined:number,time:number,count:number)
	{
		const file = this.getFile(modname,filename);
		const change = new TimerAndCount(time,count);
		const funcdata = file.functions.get(linedefined);
		file.functions.set(linedefined,change.add(funcdata));
	}



	Report(filename:string)
	{

		const filedata = new ProfileFileData();

		this.mod.forEach(mod=>{
			const file = mod.file.get(filename);
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




export class Profile implements vscode.Disposable  {
	private readonly profileData = new ProfileData();
	private readonly profileTreeRoot = new ProfileTreeNode("root",0);

	private profileOverhead = new TimerAndCount(0,0);
	private timeDecorationType: vscode.TextEditorDecorationType;
	private funcDecorationType: vscode.TextEditorDecorationType;
	private rulerDecorationTypes: {type:vscode.TextEditorDecorationType;threshold:number}[];
	private statusBar: vscode.StatusBarItem;
	private flamePanel?: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	constructor(
		withTree:boolean,
		private readonly context: vscode.ExtensionContext,
		private readonly debug:vscode.DebugSession,
		)
	{
		this._disposables.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(this.onCustomEvent, this));
		this._disposables.push(vscode.debug.onDidTerminateDebugSession(this.dispose,this));

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

		const rulers = vscode.workspace.getConfiguration().get<{color?:string;themeColor?:string;threshold:number;lane?:string}[]>("factorio.profile.rulers",[]);
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

		this._disposables.push(vscode.window.onDidChangeActiveTextEditor(editor =>{
			if (editor && (editor.document.uri.scheme==="file"||editor.document.uri.scheme==="zip"))
			{
				this.render(editor);
			}
		}));

		if (withTree)
		{
			this.createFlamePanel();
		}
	}

	dispose() {
		this._disposables.forEach(d=>d.dispose());
		this.timeDecorationType.dispose();
		this.funcDecorationType.dispose();
		this.rulerDecorationTypes.forEach(ruler=>{ruler.type.dispose();});
		this.statusBar.dispose();
		if (this.flamePanel){
			this.flamePanel.dispose();
		}
	}

	private async onCustomEvent(event:vscode.DebugSessionCustomEvent) {
		if (event.session === this.debug && event.event === "x-Factorio-Profile") {
			await this.parse(event.body);

			const editor = vscode.window.activeTextEditor;
			if (editor && (editor.document.uri.scheme==="file"||editor.document.uri.scheme==="zip"))
			{
				this.render(editor);
			}
		}
	}

	private async createFlamePanel()
	{
		if (this.flamePanel)
		{
			return;
		}

		this.flamePanel = vscode.window.createWebviewPanel(
			'factorioProfile',
			'Factorio Profile',
			vscode.ViewColumn.Two,
			{
				enableScripts: true,
				localResourceRoots: [ this.context.extensionUri ],
			}
		);
		const flameview = this.flamePanel.webview;
		flameview.html = (await vscode.workspace.fs.readFile(
			vscode.Uri.joinPath(this.context.extensionUri,"profile_flamegraph.html"))).toString().replace(
				/(src|href)="([^"]+)"/g,(_,attr,value)=>{
					return `${attr}="${flameview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri,value))}"`;
				}
			);

		flameview.onDidReceiveMessage(
			(mesg:{command:"init"}|{command:"click";name:string;filename?:string;line?:number})=>{
			switch (mesg.command) {
				case "init":
					flameview.postMessage({command:"update",data:this.profileTreeRoot});
					break;
				case "click":
					if(mesg.line && mesg.line > 0)
					{
						if (mesg.filename && mesg.line)
						{
							vscode.window.showTextDocument(
								vscode.Uri.parse(mesg.filename),
								{
									selection: new vscode.Range(mesg.line,0,mesg.line,0),
									viewColumn: vscode.ViewColumn.One
								}
							);
						}
					}
					break;
				default:
					break;
			}
		});
		this.flamePanel.onDidDispose(()=>this.flamePanel=undefined);
	}

	private async parse(profile:string)
	{
		const lines = profile.split("\n");
		let currmod:string|undefined;
		let currfile:string|undefined;
		const profileTreeStack = [new ProfileTreeNode("root",0)];
		let currnode:ProfileTreeNode|undefined;
		for (const line of lines) {
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
						currfile = await this.debug.customRequest("x-Factorio-ConvertPath", {
							path: parts[1].replace(/[\r\n]*/g,"")
						});
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
						this.profileOverhead = this.profileOverhead.add(new TimerAndCount(time,1));
					}
					break;
				case "PROOT":
					if (currmod)
					{
						assert(profileTreeStack.length === 1);
						currnode = profileTreeStack[0].AddToChild(currmod,0);
					}
					break;
				case "PTREE": // PTREE:funcname:filename:line:label: time
					if (currnode)
					{
						const funcname = parts[1];
						const filename = await this.debug.customRequest("x-Factorio-ConvertPath", {
							path: parts[2]
						});
						const line = parts[3];
						const nodename = funcname + ":" + filename + ":" + line;
						const time =  parseFloat(parts[5]);
						profileTreeStack.push(currnode);
						currnode = currnode.AddToChild(nodename,time,filename,parseInt(line));
					}
					break;
				case "PTEND":
					if (currnode)
					{
						if (profileTreeStack.length === 1){
							currnode = undefined;
						} else {
							currnode = profileTreeStack.pop();
						}
					}
					break;
			}
		};

		assert(profileTreeStack.length === 1);
		if (this.flamePanel && this.flamePanel.visible)
		{
			this.flamePanel.webview.postMessage({command:"merge",data:profileTreeStack[0]});
		}
		this.profileTreeRoot.Merge(profileTreeStack[0]);
	}

	public render(editor:vscode.TextEditor)
	{
		const report = this.profileData.Report(editor.document.uri.toString());
		const reportmax = report.fileData.max();

		const maxtime = reportmax.line.timer;
		const maxavg = reportmax.line.average;
		const maxcount = reportmax.line.count;

		const linedecs = new Array<vscode.DecorationOptions>();
		const funcdecs = new Array<vscode.DecorationOptions>();
		const rulerthresholds = this.rulerDecorationTypes.map((ruler,i)=>{
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
					const ruler = rulerthresholds.find(ruler=>{return t >= ruler.threshold;});
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