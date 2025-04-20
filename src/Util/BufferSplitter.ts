import type { Readable } from "stream";
import { EventEmitter } from "events";


export type RangeSplitMatcher = {start:Buffer;end:Buffer};
export type SplitMatcher = Buffer|RangeSplitMatcher;

export class BufferSplitter extends EventEmitter {
	private buf:Buffer;
	private readonly matchers:SplitMatcher[];
	constructor(instream:Readable, matchers:Buffer|(SplitMatcher)[]) {
		super();
		this.buf = Buffer.alloc(0);
		this.matchers = (matchers instanceof Buffer ? [matchers] : matchers) as SplitMatcher[];
		instream.on("close", ()=>{
			this.emit("close");
		});
		instream.on("end", ()=>{
			this.emit("end");
		});
		instream.on("data", (chunk:Buffer)=>{
			this.buf = Buffer.concat([this.buf, chunk]);

			while (this.buf.length > 0) {
				const indexes = this.matchers.map(m=>this.buf.indexOf(m instanceof Buffer?m:(m as RangeSplitMatcher).start));
				const index = indexes.reduce((a, b)=>a===-1?b:(b===-1?a:Math.min(a, b)));
				if (index !== -1) {
					const match = this.matchers[indexes.indexOf(index)];
					if (match instanceof Buffer) {
						if (index > 0) {
							this.emit("segment", this.buf.slice(0, index));
						}
						this.buf = this.buf.slice(index + match.length);
					} else {
						const range = match as RangeSplitMatcher;
						// split to [BEFORESTART] start [INSIDE] end [REST]
						// might need to wait for more [INSIDE] before end

						// go ahead and pick out BEFORESTART and emit it
						if (index > 0) {
							this.emit("segment", this.buf.slice(0, index));
							// adjust buffer to just before `start` in case we don't have end yet
							// to ensure we get it again on next chunk
							this.buf = this.buf.slice(index);
						}

						// look for a matching `end`
						const endindex = this.buf.indexOf(range.end, range.start.length);
						if (endindex !== -1) {
							// emit `INSIDE` and adjust buffer to follow
							this.emit("segment", this.buf.slice(range.start.length, endindex));
							this.buf = this.buf.slice(endindex+range.end.length);
						} else {
							// return to wait for another chunk that might finish this...
							return;
						}
					}
				} else {
					return;
				}
			}
		});
	}

}