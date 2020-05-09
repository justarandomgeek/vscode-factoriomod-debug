import { TextEditor, window, TextEditorDecorationType, DecorationOptions, Range, OverviewRulerLane, Disposable, StatusBarItem, workspace } from "vscode";

type FileProfileData = Map<number,number>;
type FileCountData = Map<number,number>;
type ModProfileData = Map<string,{profile:FileProfileData;count:FileCountData}>;


export class Profile implements Disposable {
	private profileData = new Map<string,ModProfileData>();
	private profileOverhead:number;
	private timeDecorationType: TextEditorDecorationType;
	private rulerDecorationTypes: {type:TextEditorDecorationType;threshold:number}[];
	private statusBar: StatusBarItem;

	constructor()
	{
		this.timeDecorationType = window.createTextEditorDecorationType({
			before: {
				contentText:"",
				color: workspace.getConfiguration().get("factorio.profile.timerTextColor"),
			}
		});

		let rulers = workspace.getConfiguration().get<{color:string;threshold:number}[]>("factorio.profile.rulers",[]);
		this.rulerDecorationTypes = rulers.map(ruler=>{
			return {
				type: window.createTextEditorDecorationType({
					overviewRulerColor: ruler.color,
					overviewRulerLane: OverviewRulerLane.Right
				}),
				threshold: ruler.threshold
			};
		});
		this.statusBar = window.createStatusBarItem();

	}
	dispose() {
		this.timeDecorationType.dispose();
		this.rulerDecorationTypes.forEach(ruler=>{ruler.type.dispose();});
		this.statusBar.dispose();
	}

	public parse(profile:string)
	{
		const lines = profile.split("\n");
		const newprofile = new Map<string,ModProfileData>();
		let newoverhead:number = NaN;
		let currmod:string;
		let currfile:string;
		lines.forEach(line => {
			const parts = line.split(":");
			switch(parts[0])
			{
				case "PROFILE": // nothing
					break;
				case "PMN": // PMN:modname
					currmod = parts[1].replace(/[\r\n]*/g,"");
					newprofile.set(currmod,new Map<string,{profile:FileProfileData;count:FileCountData}>());
					break;
				case "PFN": // PFN:filename
					if (currmod)
					{
						const mod = newprofile.get(currmod)!;
						currfile = parts[1].replace(/[\r\n]*/g,"");
						mod.set(currfile,{profile:new Map<number,number>(),count:new Map<number,number>()});
					}
					break;
				case "PLN": // PLN:line:label: time:count
					if (currmod && currfile)
					{
						const mod = newprofile.get(currmod)!;
						const file = mod.get(currfile)!;
						const line =  parseInt(parts[1]);
						const time =  parseFloat(parts[3]);
						const count =  parseInt(parts[4]);
						file.profile.set(line,time);
						file.count.set(line,count);
					}
					break;
				case "POV": //POV:label: time
					{
						const time =  parseFloat(parts[2]);
						newoverhead = time;
					}
			}
		});
		this.profileData = newprofile;
		this.profileOverhead = newoverhead;
	}

	public render(editor:TextEditor,filename:string)
	{
		const filetimes = new Map<number,number>();
		const filecounts = new Map<number,number>();
		let maxtime = 0.0;
		let maxcount = 0;
		this.profileData.forEach(modprofile => {
			const file = modprofile.get(filename);
			if (file)
			{
				file.profile.forEach((time,line) => {
					const newtime = time + (filetimes.get(line)??0);
					maxtime = Math.max(maxtime,newtime);
					filetimes.set(line,newtime);
				});
				file.count.forEach((count,line) => {
					const newcount = count + (filecounts.get(line)??0);
					maxcount = Math.max(maxcount,newcount);
					filecounts.set(line,newcount);
				});
			}
		});
		let decs = new Array<DecorationOptions>();
		let rulerthresholds = this.rulerDecorationTypes.map((ruler,i)=>{
			return {
				type: ruler.type,
				threshold: ruler.threshold,
				decs: new Array<DecorationOptions>()
			};
		});
		const displayAverageTime = workspace.getConfiguration().get("factorio.profile.displayAverageTime");
		const colorByCount = workspace.getConfiguration().get("factorio.profile.colorByCount");
		const highlightColor = workspace.getConfiguration().get("factorio.profile.timerHighlightColor");
		const colorscale = Math.log(colorByCount?maxcount:maxtime);
		const countwidth = Math.ceil(Math.log10(maxcount))+1;
		const timewidth = Math.ceil(Math.log10(Math.floor(maxtime)))+4+1;
		const width = countwidth+timewidth+3;

		for (let line = 1; line <= editor.document.lineCount; line++) {
			const time = filetimes.get(line);
			if (time)
			{
				const count = filecounts.get(line)!;
				const displayTime = displayAverageTime ? time/count : time;
				const t = Math.log(colorByCount?count:time)/colorscale;
				const range = editor.document.validateRange(new Range(line-1,0,line-1,65535/0));
				decs.push({
					range: range,
					renderOptions: {
						before: {
							backgroundColor: `${highlightColor}${Math.floor(255*t).toString(16)}`,
							contentText: `${count.toString().padStart(countwidth,"\u00A0")}${displayTime.toFixed(3).padStart(timewidth,"\u00A0")}\u00A0ms`,
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
				decs.push({
					range: editor.document.validateRange(new Range(line-1,0,line-1,65535)),
					renderOptions: {
						before: {
							width: `${width+1}ch`,
						}
					}
				});
			}
		}

		editor.setDecorations(this.timeDecorationType,decs);

		rulerthresholds.forEach((ruler)=>{
			editor.setDecorations(ruler.type,ruler.decs);
		});
		this.statusBar.text = `Profile Dump took ${this.profileOverhead.toFixed(3)} ms`;
		this.statusBar.show();
	}

	public clear()
	{
		window.visibleTextEditors.forEach(editor => {
			editor.setDecorations(this.timeDecorationType,[]);
			this.rulerDecorationTypes.forEach(ruler=>{
				editor.setDecorations(ruler.type,[]);
			});
		});
		this.statusBar.hide();
	}
}