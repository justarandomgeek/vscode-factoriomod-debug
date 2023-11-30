import { overlay } from "./Overlay";
import type { DocSettings } from "./DocSettings";
import { LuaLSAlias, LuaLSArray, LuaLSClass, LuaLSDict, LuaLSEnum, LuaLSEnumField, LuaLSField, LuaLSFile, LuaLSFunction, LuaLSLiteral, LuaLSOperator, LuaLSOverload, LuaLSParam, LuaLSReturn, LuaLSType, LuaLSTypeName, LuaLSUnion, to_lua_ident } from "./LuaLS";

function sort_by_order(a:{order:number}, b:{order:number}) {
	return a.order - b.order;
}

export class ApiDocGenerator<V extends ApiVersions = ApiVersions> {
	private readonly docs:ApiDocs<V>;

	private readonly classes:Map<string, ApiClass>;
	private readonly events:Map<string, ApiEvent>;
	private readonly concepts:Map<string, ApiConcept>;
	private readonly builtins:Map<string, ApiBuiltin>;
	private readonly globals:Map<string, ApiGlobalObject>;

	private readonly defines:Set<string>;

	constructor(docjson:string, docsettings:DocSettings) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw `Unknown application: ${this.docs.application}`;
		}

		if (!(this.docs.api_version===3 || this.docs.api_version===4)) {
			throw `Unsupported JSON Version ${this.docs.api_version}`;
		}

		if (this.docs.stage !== "runtime") {
			throw `Wrong stage: ${this.docs.stage}`;
		}

		this.classes = new Map(this.docs.classes.map(c=>[c.name, c]));
		this.events = new Map(this.docs.events.map(c=>[c.name, c]));
		this.concepts = new Map(this.docs.concepts.map(c=>[c.name, c]));
		this.builtins = new Map(this.docs.builtin_types.map(c=>[c.name, c]));

		this.globals = new Map(this.docs.global_objects.map(g=>[g.type, g]));


		const add_define = (define:ApiDefine, name_prefix:string)=>{
			const name = `${name_prefix}${define.name}`;
			this.defines.add(name);
			const child_prefix = `${name}.`;
			if (define.values) {
				define.values.forEach(value=>{
					this.defines.add(`${child_prefix}${value.name}`);
				});
			}
			if (define.subkeys) {
				define.subkeys.forEach(subkey=>add_define(subkey, child_prefix));
			}
		};

		this.defines = new Set<string>();
		this.defines.add("defines");
		this.docs.defines.forEach(define=>add_define(define, "defines."));
	}

	public get api_version() : V {
		return this.docs.api_version;
	}

	public get stage() : string {
		return this.docs.stage;
	}

	public get application() : string {
		return this.docs.application;
	}

	public get application_version() : string {
		return this.docs.application_version;
	}

	public resolve_link(member:string, part?:string):string {
		part = part ? `#${part}` : "";
		if (['classes', 'events', 'concepts', 'defines'].includes(member)) {
			return `/${member}.html${part}`;
		}
		if (member === 'builtin_types') {
			return `/builtin-types.html${part}`;
		}
		if (['libraries', 'global', 'migrations'].includes(member)) {
			return `/auxiliary/${member}.html${part}`;
		}
		if (this.concepts.has(member)) {
			return `/concepts.html#${member}`;
		}
		if (this.classes.has(member)) {
			return `/classes/${member}.html${part}`;
		}
		if (this.events.has(member)) {
			return `/events.html#${member}`;
		}
		if (this.builtins.has(member)) {
			return `/builtin-types.html#${member}`;
		}
		if (this.defines.has(member)) {
			return `/defines.html#${member}`;
		}
		return "###INVALID LINK###";
		throw new Error("Invalid Link");
	}

	private with_base_classes<T>(c:ApiClass, getter:(c:ApiClass)=>T) {
		const own = getter(c);
		const bases = c.base_classes
			?.map(b=>this.classes.get(b))
			.filter((b):b is ApiClass=>!!b)
			.map(getter) ?? [];

		return [own, ...bases].flat();
	}

	public generate_debuginfo() {
		const debuginfo = {
			eventlike: {
				__index: {} as {[classname:string]:{[methodname:string]:true}},
				__newindex: {} as {[classname:string]:{[propname:string]:true}},
			},
			alwaysValid: {} as {[classname:string]:true},
			expandKeys: {
			} as {[classname:string]:{[propname:string]:{
				readOnly?:boolean
				enumFrom?:string
				thisTranslated?:boolean
				thisAsTable?:boolean
				iterMode?: "count"|"pairs"|"ipairs"
				countLine?: boolean
				fetchable?: boolean
			}}},
		};

		this.classes.forEach(c=>{
			if (["LuaCustomTable"].includes(c.name)) { return; }
			const cc:typeof debuginfo.expandKeys[string] = {};
			let hasValid = false;
			debuginfo.expandKeys[c.name] = cc;
			for (const attribute of this.with_base_classes(c, (c)=>c.attributes)) {
				if (attribute.name === "valid") {
					// I don't list `valid` directly in object listings,
					// but whether classes have it at all is useful to index
					hasValid = true;
				} else if (attribute.name === "object_name") {
					// I don't list `object_name` at all, only for looking up the right types...
				} else {
					if (attribute.read) {
						cc[attribute.name] = {};
						if (!attribute.write) {
							cc[attribute.name].readOnly = true;
						}
						const type = attribute.type;
						if (typeof type === "string" && type.startsWith("defines.")) {
							cc[attribute.name].enumFrom = type;
						}
					}

					if ("raises" in attribute && attribute?.raises?.find(r=>r.timeframe==="instantly")) {
						debuginfo.eventlike.__newindex[c.name] = debuginfo.eventlike.__newindex[c.name] ?? {};
						debuginfo.eventlike.__newindex[c.name][attribute.name] = true;
					}
				}
			}

			if (!hasValid) {
				debuginfo.alwaysValid[c.name] = true;
			}

			for (const operator of c.operators) {
				switch (operator.name) {
					case "index":
						cc["[]"] = {
							readOnly: !operator.write,
							thisAsTable: true,
							iterMode: "count",
						};
						break;

					case "length":
					default:
						break;
				}
			}

			for (const method of this.with_base_classes(c, (c)=>c.methods)) {
				if ("raises" in method && method.raises?.find(r=>r.timeframe==="instantly")) {
					debuginfo.eventlike.__index[c.name] = debuginfo.eventlike.__index[c.name] ?? {};
					debuginfo.eventlike.__index[c.name][method.name] = true;
				}

				if (["help", 'generate_event_name'].includes(method.name)) { continue; }
				if (method.parameters.length > 0) { continue; }
				if (method.return_values.length === 0) { continue; }
				if (method.raises) { continue; }
				cc[method.name] = {
					readOnly: true,
					fetchable: true,
				};
			}

		});

		return debuginfo;
	}

	public async generate_LuaLS_docs(
		format_description:DocDescriptionFormatter
	):Promise<LuaLSFile[]> {
		return Promise.all([
			... (await this.generate_LuaLS_classes(format_description)),
			this.generate_LuaLS_concepts(format_description),
			this.generate_LuaLS_defines(format_description),
			this.generate_LuaLS_events(format_description),
			this.generate_LuaLS_LuaObjectNames(),
			this.generate_LuaLS_global_functions(format_description),
		]);
	}


	private async generate_LuaLS_classes(format_description:DocDescriptionFormatter) {
		const files:LuaLSFile[] = [];
		for (const aclass of this.docs.classes) {
			files.push(await this.generate_LuaLS_class(aclass, format_description));
		}
		return files;
	}

	private async generate_LuaLS_class(aclass:ApiClass, format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile(`runtime-api/${aclass.name}`, this.docs.application_version);
		const lsclass = new LuaLSClass(aclass.name);

		const global = this.globals.get(aclass.name);
		if (global) {
			lsclass.global_name = global.name;
		}
		lsclass.description = format_description(this.collect_description(aclass, { scope: "runtime", member: aclass.name }));

		lsclass.parents = (aclass.base_classes ?? ["LuaObject"]).map(t=>new LuaLSTypeName(t));
		lsclass.generic_args = overlay.adjust.class[aclass.name]?.generic_params;
		if (overlay.adjust.class[aclass.name]?.generic_parent) {
			lsclass.parents.push(await this.LuaLS_type(overlay.adjust.class[aclass.name]?.generic_parent));
		}

		for (const attribute of aclass.attributes) {
			lsclass.add(new LuaLSField(
				attribute.name,
				await this.LuaLS_type(attribute.type, {
					file, table_class_name: `${aclass.name}.${attribute.name}`, format_description,
				}),
				format_description(this.collect_description(attribute, { scope: "runtime", member: aclass.name, part: attribute.name }))
			));
		}

		for (const operator of aclass.operators) {
			switch (operator.name) {
				case "call":
				{
					const callop = new LuaLSOverload();
					callop.description = format_description(this.collect_description(operator,  { scope: "runtime", member: aclass.name, part: "call_operator" }));
					callop.params = await this.LuaLS_params(operator.parameters, format_description);
					callop.returns = await this.LuaLS_returns(operator.return_values, format_description);
					lsclass.add(callop);
					break;
				}
				case "length":
				{
					const lenop = new LuaLSOperator("len", await this.LuaLS_type(operator.type));
					lenop.description = format_description(this.collect_description(operator, { scope: "runtime", member: aclass.name, part: "length_operator" }));
					lsclass.add(lenop);
					break;
				}
				case "index":
				{
					if (overlay.adjust.class[aclass.name]?.no_index) { break; }
					lsclass.add(new LuaLSField(
						await this.LuaLS_type(overlay.adjust.class[aclass.name]?.index_key ?? "uint"),
						await this.LuaLS_type(operator.type),
						format_description(this.collect_description(operator, { scope: "runtime", member: aclass.name, part: "index_operator" })),
					));
					break;
				}
				default:
					throw `Unkown operator: ${(<ApiOperator>operator).name}`;
			}
		}

		let funcclass = lsclass;
		if (overlay.adjust.class[aclass.name]?.split_funcs) {
			funcclass = new LuaLSClass(`${aclass.name}_funcs`);

			file.add(funcclass);
			lsclass.parents.push(new LuaLSTypeName(`${aclass.name}_funcs`));
		}

		for (const method of aclass.methods) {
			funcclass.add(await this.LuaLS_function(method, file, format_description, aclass.name));
		}

		file.add(lsclass);
		return file;
	}

	private async generate_LuaLS_concepts(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/concepts", this.docs.application_version);

		for (const concept of this.docs.concepts) {
			const description = format_description(this.collect_description(concept, { scope: "runtime", member: concept.name }));
			if (typeof concept.type === "string") {
				file.add(new LuaLSAlias(concept.name, await this.LuaLS_type(concept.type), description));
			} else {
				switch (concept.type.complex_type) {
					//@ts-expect-error fallthrough
					case "dictionary":
						// check for dict<union,true> and treat as flags instead...
						const k = concept.type.key;
						const v = concept.type.value;
						if (typeof v === "object" && v.complex_type === "literal" && v.value === true &&
								typeof k === "object" && k.complex_type === "union") {
							const lsclass = new LuaLSClass(concept.name);
							lsclass.description = description;
							for (const option of k.options) {
								lsclass.add(new LuaLSField(await this.LuaLS_type(option), await this.LuaLS_type(v)));
							}
							file.add(lsclass);
							break;
						}
					case "union":
					case "array":
					case "table":
					case "tuple":
					case "struct":
					case "LuaStruct":
					{
						const inner = await this.LuaLS_type(concept.type, {file, table_class_name: concept.name, format_description});
						if (inner instanceof LuaLSTypeName && inner.name === concept.name) {

						} else {
							file.add(new LuaLSAlias(concept.name, inner, description));
						}
						break;
					}
					default:
						break;
						throw new Error("");

				}
			}
		}
		return file;
	}

	private async generate_LuaLS_defines(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/defines", this.docs.application_version);
		const defines = new LuaLSClass("defines");
		defines.global_name="defines";
		defines.description = format_description(undefined, {scope: "runtime", member: "defines"});
		file.add(defines);

		const generate = async (define:ApiDefine, name_prefix:string)=>{
			const name = `${name_prefix}${define.name}`;
			const description = format_description(this.collect_description(define, {scope: "runtime", member: name}));
			//there aren't any with both values and subkeys for now,
			//we'll deal with that if it ever happens...
			if (define.values) {
				file.add(new LuaLSEnum(name, define.values.map(v=>new LuaLSEnumField(v.name, v.description)), description));
			} else {
				const lsclass = new LuaLSClass(name);
				lsclass.global_name = name;
				lsclass.description = description;
				const adjust = overlay.adjust.define[name];
				if (adjust?.subkeys) {
					lsclass.parents = [
						adjust.subkeys
							.map(t=>new LuaLSTypeName(t))
							.reduceRight<LuaLSType>((inner, key)=>new LuaLSDict(key, inner), new LuaLSLiteral(0)),
					];
				}
				file.add(lsclass);

				if (define.subkeys) {
					const child_prefix = `${name}.`;
					for (const subkey of define.subkeys) {
						await generate(subkey, child_prefix);
					}
				}
			}
		};

		for (const define of this.docs.defines) {
			await generate(define, "defines.");
		}
		return file;
	}

	private async generate_LuaLS_events(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/events", this.docs.application_version);
		const handlers = new LuaLSClass("event_handler.events");

		for (const [_, event] of this.events) {
			const handler = new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData.${event.name}`))]);
			handlers.add(new LuaLSField(
				new LuaLSTypeName(event.name === "CustomInputEvent"?"string":`defines.events.${event.name}`),
				handler));

			const lsevent = new LuaLSClass(`EventData.${event.name}`);
			lsevent.parents = [new LuaLSTypeName("EventData")];
			lsevent.description = format_description(this.collect_description(event, {scope: "runtime", member: event.name}));
			for (const param of event.data) {
				lsevent.add(new LuaLSField(
					param.name,
					await this.LuaLS_type(param.type),
					format_description(this.collect_description(param, {scope: "runtime", member: event.name, part: param.name})),
					param.optional,
				));
			}
			file.add(lsevent);
		}

		const generic_handler = new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData`))]);
		handlers.add(new LuaLSField(new LuaLSTypeName("uint"), generic_handler));

		file.add(handlers);
		return file;
	}

	private async generate_LuaLS_LuaObjectNames() {
		const file = new LuaLSFile("runtime-api/LuaObjectNames", this.docs.application_version);
		file.add(new LuaLSAlias("LuaObject.object_name", new LuaLSUnion(
			this.docs.classes.filter(c=>!c.abstract).map(c=>new LuaLSLiteral(c.name))
		)));
		return file;
	}

	private async generate_LuaLS_global_functions(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/global_functions", this.docs.application_version);

		for (const func of this.docs.global_functions) {
			file.add(await this.LuaLS_function(func, file, format_description));
		}

		return file;
	}

	private async LuaLS_params(params:ApiParameter[], format_description:DocDescriptionFormatter):Promise<LuaLSParam[]> {
		return Promise.all(params.sort(sort_by_order).map(async p=>new LuaLSParam(
			to_lua_ident(p.name),
			await this.LuaLS_type(p.type),
			format_description(this.collect_description(p)),
			p.optional,
		)));
	}

	private async LuaLS_returns(returns:ApiMethod["return_values"], format_description:DocDescriptionFormatter):Promise<LuaLSReturn[]> {
		return Promise.all(returns.sort(sort_by_order).map(async r=>new LuaLSReturn(
			await this.LuaLS_type(r.type),
			undefined,
			format_description(this.collect_description(r)),
			r.optional,
		)));
	}

	private async LuaLS_function(func:ApiMethod, file:LuaLSFile, format_description:DocDescriptionFormatter, in_class?:string):Promise<LuaLSFunction> {
		const params = func.takes_table ?
			[ new LuaLSParam("param", await this.LuaLS_table_type(func, file, `${in_class??""}${in_class?".":""}${func.name}_param`, format_description)) ]:
			await this.LuaLS_params(func.parameters, format_description);
		if (func.variadic_type) {
			params.push(new LuaLSParam(
				"...",
				await this.LuaLS_type(func.variadic_type),
				format_description(func.variadic_description)
			));
		}
		const lsfunc = new LuaLSFunction(func.name,
			params,
			await this.LuaLS_returns(func.return_values, format_description),
			format_description(func.description, {scope: "runtime", member: in_class??"libraries", part: in_class?func.name:"new-functions"})
		);
		return lsfunc;
	}

	// method table params and table/tuple complex_types
	private async LuaLS_table_type(type_data:ApiWithParameters, file:LuaLSFile,  table_class_name:string, format_description:DocDescriptionFormatter, parents?:LuaLSType[]):Promise<LuaLSTypeName> {
		const lsclass = new LuaLSClass(table_class_name);
		lsclass.parents = parents;
		file.add(lsclass);

		let i = 1;
		for (const param of type_data.parameters.sort(sort_by_order)) {
			const is_tuple = "complex_type" in type_data && type_data.complex_type === "tuple";

			lsclass.add(new LuaLSField(
				is_tuple?new LuaLSLiteral(i++):param.name,
				await this.LuaLS_type(param.type),
				format_description(this.collect_description(param)),
				param.optional,
			));
		}

		if (type_data.variant_parameter_groups) {
			const inners:LuaLSType[] = [];
			const innerunion = new LuaLSAlias(lsclass.name, new LuaLSUnion(inners));
			file.add(innerunion);
			lsclass.name += ".base";
			for (const group of type_data.variant_parameter_groups) {
				const inner = (await this.LuaLS_table_type(group, file, `${table_class_name}.${to_lua_ident(group.name)}`, format_description, [ new LuaLSTypeName(lsclass.name) ]));
				inners.push(inner);
			}
			return new LuaLSTypeName(innerunion.name);
		}
		return new LuaLSTypeName(lsclass.name);;
	}

	private async LuaLS_type(api_type:ApiType|undefined, in_parent?:{
		file:LuaLSFile
		table_class_name:string
		format_description:DocDescriptionFormatter
	}):Promise<LuaLSType> {
		if (!api_type) { return new LuaLSTypeName("any"); }
		if (typeof api_type === "string") { return new LuaLSTypeName(api_type); }
		const sub_parent = (name:string)=>{
			if (!in_parent) {
				return in_parent;
			}
			return {
				file: in_parent.file,
				table_class_name: `${in_parent.table_class_name}.${name}`,
				format_description: in_parent.format_description,
			};
		};
		switch (api_type.complex_type) {
			case "array":
				return new LuaLSArray(await this.LuaLS_type(api_type.value, sub_parent("member")));
			case "dictionary":
				return new LuaLSDict(await this.LuaLS_type(api_type.key, sub_parent("key")), await this.LuaLS_type(api_type.value, sub_parent("value")));
			case "union":
				return new LuaLSUnion(await Promise.all(api_type.options.map((t, i)=>this.LuaLS_type(t, sub_parent(`${i}`)))));
			case "LuaLazyLoadedValue":
				return new LuaLSTypeName("LuaLazyLoadedValue", [await this.LuaLS_type(api_type.value, sub_parent("value"))]);
			case "LuaCustomTable":
				return new LuaLSTypeName("LuaCustomTable", await Promise.all([this.LuaLS_type(api_type.key, sub_parent("key")), this.LuaLS_type(api_type.value, sub_parent("value"))]));
			case "literal":
				return new LuaLSLiteral(api_type.value);
			case "function":
				return new LuaLSFunction(undefined, await Promise.all(api_type.parameters.map(async(p, i, a)=>new LuaLSParam(`p${i+1}`, await this.LuaLS_type(p, sub_parent(`param${a.length>1?i:""}`))))));
			case "type":
				return this.LuaLS_type(api_type.value, in_parent);
			case "table":
			case "tuple":
				if (!in_parent) {
					throw new Error(`${api_type.complex_type} without parent`);
				}
				return this.LuaLS_table_type(api_type, in_parent.file, in_parent.table_class_name, in_parent.format_description);

			case "struct":// V3
			case "LuaStruct":// V4
			{
				if (!in_parent) {
					throw new Error(`${api_type.complex_type} without parent`);
				}
				const lsclass = new LuaLSClass(in_parent.table_class_name);
				for (const attribute of api_type.attributes) {
					lsclass.add(new LuaLSField(
						attribute.name,
						await this.LuaLS_type(attribute.type, {
							file: in_parent.file,
							table_class_name: `${in_parent.table_class_name}.${attribute.name}`,
							format_description: in_parent.format_description,
						}),
						in_parent.format_description(this.collect_description(attribute)),
					));
				}
				in_parent.file.add(lsclass);
				return new LuaLSTypeName(in_parent.table_class_name);
			}

		}
		throw new Error("Invalid Type");

	}

	private collect_description(obj:Omit<ApiWithNotes, "name">&{
		readonly subclasses?:string[]
		readonly raises?: ApiEventRaised[]
	}&({
		readonly read: boolean
		readonly write: boolean
	}|{}), doclink?:DocLink, description?:string) {
		if (!description) {
			description = obj.description;
		}
		if ('read' in obj) {
			description = `[${obj.read?"R":""}${obj.write?"W":""}] ${description??""}`;
		}
		return [
			description,
			obj.notes?.map(note=>`**Note:** ${note}`)?.join("\n\n"),
			obj.raises && (
				`**Events:**\n${
					obj.raises?.map(raised=>` * ${raised.optional?"May":"Will"} raise [${raised.name}](runtime:events::${raised.name}) ${{instantly: "instantly", current_tick: "later in the current tick", future_tick: "in a future tick"}[raised.timeframe]}.${raised.description?"\n"+raised.description:""}`,)?.join("\n\n") }`
			),
			doclink && `[View Documentation](${doclink.scope}:${doclink.member}${doclink.part?"::"+doclink.part:""})`,
			obj.examples?.map(example=>`### Example\n${example}`)?.join("\n\n"),
			obj.subclasses && (
				`_Can only be used if this is ${
					obj.subclasses.length === 1 ? obj.subclasses[0] :
					`${obj.subclasses.slice(0, -1).join(", ")} or ${obj.subclasses[obj.subclasses.length-1]}`
				}_`
			),
		].filter(s=>!!s).join("\n\n");
	}
}