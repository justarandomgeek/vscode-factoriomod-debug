import { overlay } from "./Overlay";
import type { Writable } from "stream";
import type { DocSettings } from "./DocSettings";
import { LuaLSAlias, LuaLSArray, LuaLSClass, LuaLSDict, LuaLSEnum, LuaLSEnumField, LuaLSField, LuaLSFile, LuaLSFunction, LuaLSLiteral, LuaLSParam, LuaLSReturn, LuaLSType, LuaLSTypeName, LuaLSUnion, escape_lua_keyword, to_lua_ident } from "./LuaLS";


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

	private readonly runtime_api_base:string;

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

		switch (docsettings.docLinksVersion) {
			case "latest":
			default:
				this.runtime_api_base = "https://lua-api.factorio.com/latest/";
				break;
			case "current":
				this.runtime_api_base = `https://lua-api.factorio.com/${this.docs.application_version}/`;
				break;
		}

		this.classes = new Map(this.docs.classes.map(c=>[c.name, c]));
		this.events = new Map(this.docs.events.map(c=>[c.name, c]));
		this.concepts = new Map(this.docs.concepts.map(c=>[c.name, c]));
		this.builtins = new Map(this.docs.builtin_types.map(c=>[c.name, c]));

		this.globals = new Map(this.docs.global_objects.map(g=>[
			this.format_sumneko_type(g.type, ()=>{
				throw "complex global";
			}),
			g,
		]));


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
		if (member === 'libraries') {
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
			this.generate_LuaLS_LuaObjectNames(format_description),
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
		const file = new LuaLSFile(`runtime-api-${aclass.name}`, this.docs.application_version);
		const lsclass = new LuaLSClass(aclass.name);
		//TODO: description

		lsclass.parents = (aclass.base_classes ?? ["LuaObject"]).map(t=>new LuaLSTypeName(t));
		lsclass.generic_args = overlay.adjust.class[aclass.name]?.generic_params;
		lsclass.fields = [];
		lsclass.functions = [];

		for (const operator of aclass.operators) {
			switch (operator.name) {
				case "call":
				case "length":
				case "index":

					break;

				default:
					throw `Unkown operator: ${(<ApiOperator>operator).name}`;
			}
		}

		for (const attribute of aclass.attributes) {
			const lsfield = new LuaLSField(attribute.name, await this.LuaLS_type(attribute.type, {
				file, table_class_name: `${aclass.name}.${attribute.name}`, format_description,
			}));
			lsclass.fields.push(lsfield);
		}

		for (const method of aclass.methods) {
			lsclass.functions.push(await this.LuaLS_function(method, file, format_description, aclass.name));
		}


		file.add(lsclass);
		return file;
	}

	private async generate_LuaLS_concepts(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api-concepts", this.docs.application_version);

		for (const concept of this.docs.concepts) {
			if (typeof concept.type === "string") {
				//TODO: description
				const alias = new LuaLSAlias(concept.name, await this.LuaLS_type(concept.type));
				file.add(alias);
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
							lsclass.fields = [];
							for (const option of k.options) {
								const lsfield = new LuaLSField(await this.LuaLS_type(option), await this.LuaLS_type(v));
								lsclass.fields.push(lsfield);
							}
							file.add(lsclass);
							break;
						}
					case "union":
					case "array":
					case "table":
					case "tuple":
					{
						const inner = await this.LuaLS_type(concept.type, {file, table_class_name: concept.name, format_description});
						if (inner instanceof LuaLSTypeName && inner.name === concept.name) {

						} else {
							const alias = new LuaLSAlias(concept.name, inner);
							file.add(alias);
						}
						break;
					}
					case "struct":
					case "LuaStruct":
					default:
						break;
						throw new Error("");

				}
			}
		}
		return file;
	}

	private async generate_LuaLS_defines(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api-defines", this.docs.application_version);
		const defines = new LuaLSClass("defines");
		defines.global_name="defines";
		defines.description = await format_description(undefined, {scope: "runtime", member: "defines"});
		file.add(defines);

		const generate = async (define:ApiDefine, name_prefix:string)=>{
			const name = `${name_prefix}${define.name}`;
			const description = format_description(define.description, {scope: "runtime", member: name});
			//there aren't any with both values and subkeys for now,
			//we'll deal with that if it ever happens...
			if (define.values) {
				const lsenum = new LuaLSEnum(name, define.values.map(v=>new LuaLSEnumField(v.name, v.description)));
				lsenum.description = await description;
				file.add(lsenum);
			} else {
				const lsclass = new LuaLSClass(name);
				lsclass.global_name = name;
				lsclass.description = await description;
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
		const file = new LuaLSFile("runtime-api-events", this.docs.application_version);
		const handlers = new LuaLSClass("event_handler.events");
		handlers.fields = [];

		for (const [_, event] of this.events) {
			const handler = new LuaLSFunction("handler");
			handler.params = [new LuaLSParam("event", new LuaLSTypeName(`EventData.${event.name}`))];
			handlers.fields.push(new LuaLSField(
				new LuaLSTypeName(event.name === "CustomInputEvent"?"string":`defines.events.${event.name}`),
				handler));

			const lsevent = new LuaLSClass(`EventData.${event.name}`);
			lsevent.fields = [];
			lsevent.parents = [new LuaLSTypeName("EventData")];
			lsevent.description = await format_description(event.description, {scope: "runtime", member: event.name});
			for (const param of event.data) {
				const lsparam = new LuaLSField(param.name, await this.LuaLS_type(param.type));
				lsparam.description = await format_description(param.description, {scope: "runtime", member: event.name, part: param.name});
				lsparam.optional = param.optional;
				lsevent.fields.push(lsparam);
			}
			file.add(lsevent);
		}

		const generic_handler = new LuaLSFunction("handler");
		generic_handler.params = [new LuaLSParam("event", new LuaLSTypeName(`EventData`))];
		handlers.fields.push(new LuaLSField(new LuaLSTypeName("uint"), generic_handler));

		file.add(handlers);
		return file;
	}

	private async generate_LuaLS_LuaObjectNames(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api-LuaObjectNames", this.docs.application_version);
		const names = new LuaLSAlias("LuaObject.object_name", new LuaLSUnion(
			this.docs.classes.filter(c=>!c.abstract).map(c=>new LuaLSLiteral(c.name))
		));
		file.add(names);
		return file;
	}

	private async generate_LuaLS_global_functions(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api-global_functions", this.docs.application_version);

		for (const func of this.docs.global_functions) {
			file.add(await this.LuaLS_function(func, file, format_description));
		}

		return file;
	}


	private async LuaLS_params(params:ApiParameter[], format_description:DocDescriptionFormatter):Promise<LuaLSParam[]> {
		return Promise.all(params.map(async p=>{
			const lsparam = new LuaLSParam(p.name, await this.LuaLS_type(p.type));
			lsparam.description = p.description;
			lsparam.optional = p.optional;
			return lsparam;
		}));
	}

	private async LuaLS_returns(returns:ApiMethod["return_values"], format_description:DocDescriptionFormatter):Promise<LuaLSReturn[]> {
		return Promise.all(returns.map(async r=>{
			const lsreturn = new LuaLSReturn(await this.LuaLS_type(r.type));
			lsreturn.description = r.description;
			lsreturn.optional = r.optional;
			return lsreturn;
		}));
	}

	private async LuaLS_function(func:ApiMethod, file:LuaLSFile, format_description:DocDescriptionFormatter, in_class?:string):Promise<LuaLSFunction> {
		const params = func.takes_table ?
			[ new LuaLSParam("param", await this.LuaLS_table_type(func, file, `${func.name}_param`, format_description)) ]:
			await this.LuaLS_params(func.parameters, format_description);
		if (func.variadic_type) {
			const dots = new LuaLSParam("...", await this.LuaLS_type(func.variadic_type));
			dots.description = await format_description(func.variadic_description);
			params.push(dots);
		}
		const lsfunc = new LuaLSFunction(func.name,
			params,
			await this.LuaLS_returns(func.return_values, format_description)
		);
		lsfunc.description = await format_description(func.description, {scope: "runtime", member: in_class??"libraries", part: in_class?func.name:"new-functions"});
		return lsfunc;
	}

	// method table params and table/tuple complex_types
	private async LuaLS_table_type(type_data:ApiWithParameters, file:LuaLSFile,  table_class_name:string, format_description:DocDescriptionFormatter, parents?:LuaLSType[]):Promise<LuaLSTypeName> {
		const lsclass = new LuaLSClass(table_class_name);
		lsclass.parents = parents;
		file.add(lsclass);
		lsclass.fields = [];

		let i = 1;
		for (const param of type_data.parameters) {
			const is_tuple = "complex_type" in type_data && type_data.complex_type === "tuple";

			const field = new LuaLSField(is_tuple?new LuaLSLiteral(i++):param.name, await this.LuaLS_type(param.type));
			//field.description = await format_description(param.description, "runtime", table_class_name, param.name);
			field.optional = param.optional;
			lsclass.fields.push(field);
		}

		if (type_data.variant_parameter_groups) {
			const inners:LuaLSType[] = [];
			const innerunion = new LuaLSAlias(lsclass.name, new LuaLSUnion(inners));
			file.add(innerunion);
			lsclass.name += ".base";
			for (const group of type_data.variant_parameter_groups) {
				const inner = (await this.LuaLS_table_type(group, file, `${table_class_name}.${to_lua_ident(group.name)}`, format_description, [ new LuaLSTypeName(lsclass.name) ]));

				//TODO: proper link names?
				//inner.description = await format_description(group.description, "runtime", "");
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

		}
		throw new Error("Invalid Type");

	}

	private write_sumneko_field(
		output:Writable, name:string, type:ApiType,
		get_table_name_and_view_doc_link:()=>[string, string],
		description:string|string[], optional?:boolean, inline_desc?:string) {
		output.write(this.convert_sumneko_description(...(description instanceof Array ? description : [description])));
		output.write(`---@field ${name}${optional ? "?" : ""} ${this.format_sumneko_type(type, get_table_name_and_view_doc_link)} ${inline_desc??""}\n`);
	}

	private add_attribute(output:Writable, classname:string, attribute:ApiAttribute, oper_lua_name?:string, type?:ApiType) {
		const aname = attribute.name;
		const view_doc_link = this.view_documentation(`${classname}.${aname}`);

		const description = this.format_entire_description(
			attribute, view_doc_link, `[${attribute.read?"R":""}${attribute.write?"W":""}]${attribute.description?`\n${attribute.description}`:''}`
		);
		this.write_sumneko_field(
			output, oper_lua_name ?? aname, type ?? attribute.type,
			()=>[`${classname}.${aname}`, view_doc_link],
			description, attribute.optional);
	};


	private add_operator(output:Writable, classname:string, ApiOperator:ApiOperator&{name:"length"}) {
		const opnames = {
			["length"]: "len",
		};
		const aname = ApiOperator.name;
		const view_doc_link = this.view_documentation(`${classname}.${aname}`);

		const description = this.format_entire_description(
			ApiOperator, view_doc_link, `[${ApiOperator.read?"R":""}${ApiOperator.write?"W":""}]${ApiOperator.description?`\n${ApiOperator.description}`:''}`
		);
		output.write(this.convert_sumneko_description(description));
		output.write(`---@operator ${opnames[aname]}: ${this.format_sumneko_type(ApiOperator.type, ()=>[`${classname}.${aname}`, view_doc_link])}\n`);
	}

	private convert_param_or_return(api_type:ApiType|undefined, optional:boolean, description:string|undefined, get_table_name_and_view_doc_link:()=>[string, string]):string {
		const formatted_type = this.format_sumneko_type(api_type, get_table_name_and_view_doc_link);
		const optional_tag = optional ? "?":"";
		if (!description) {
			return `${formatted_type}${optional_tag}\n`;
		} else if (!description.includes("\n")) {
			return `${formatted_type}${optional_tag}@${this.preprocess_description(description)}\n`;
		} else {
			return `${formatted_type}${optional_tag}@\n${this.convert_sumneko_description(description)}`;
		}
	};

	private add_return_annotation(output:Writable, classname:string, method:ApiMethod) {
		method.return_values.forEach((rv)=>{
			output.write(`---@return ${this.convert_param_or_return(rv.type, rv.optional, rv.description, ()=>[
				`${classname}.${method.name}_return`, this.view_documentation(`${classname}.${method.name}`),
			])}`);
		});
	};

	private convert_description_for_method(classname:string, method:ApiMethod, html_name?:string) {
		return this.convert_sumneko_description(
			this.format_entire_description(method, this.view_documentation(`${classname}.${html_name??method.name}`)));
	}

	private add_regular_method(output:Writable, classname:string, method:ApiMethod) {
		output.write(this.convert_description_for_method(classname, method));
		const sorted_params = method.parameters.sort(sort_by_order);
		sorted_params.forEach(parameter=>{
			output.write(`---@param ${escape_lua_keyword(parameter.name)} `);
			output.write(this.convert_param_or_return(parameter.type, parameter.optional, parameter.description, ()=>[
				`${classname}.${method.name}.${parameter.name}`, this.view_documentation(`${classname}.${method.name}`),
			]));
		});
		if (method.variadic_type) {
			output.write(`---@vararg ${this.format_sumneko_type(method.variadic_type, ()=>[`${classname}.${method.name}_vararg`, this.view_documentation(`${classname}.${method.name}`)])}\n`);
			if (method.variadic_description) {
				output.write(this.convert_sumneko_description(`\n**vararg**: ${method.variadic_description.includes("\n")?"\n\n":""}${method.variadic_description}`));
			}
		}
		this.add_return_annotation(output, classname, method);

		output.write(`${method.name}=function(${sorted_params.map(p=>escape_lua_keyword(p.name)).concat(method.variadic_type?["..."]:[]).join(",")})end${classname!==""?",":""}\n`);
	};

	private add_method_taking_table(output:Writable, classname:string, method:ApiMethod) {
		const param_class_name = `${classname}.${method.name}_param`;
		this.add_table_type(output, method, param_class_name, this.view_documentation(`${classname}.${method.name}`));
		output.write("\n");
		output.write(this.convert_description_for_method(classname, method));
		output.write(`---@param param${method.table_is_optional?"?":" "}${param_class_name}\n`);
		this.add_return_annotation(output, classname, method);
		output.write(`${method.name}=function(param)end${classname!==""?",":""}\n`);
	};

	private add_method(output:Writable, classname:string, method:ApiMethod) {
		return method.takes_table?this.add_method_taking_table(output, classname, method):this.add_regular_method(output, classname, method);
	}

	private add_sumneko_class(output:Writable, aclass:ApiClass):void {

		const needs_label = !!(aclass.description || aclass.notes);
		output.write(this.convert_sumneko_description(this.format_entire_description(
			aclass, this.view_documentation(aclass.name),
			this.globals.get(aclass.name)?.description ?
				`**Global Description:**\n${this.globals.get(aclass.name)?.description}${needs_label?"\n\n**Class Description:**\n":"\n\n"}${aclass.description}` :
				aclass.description
		)));

		const base_classes = aclass.base_classes ?? ["LuaObject"];
		const generic_params = overlay.adjust.class[aclass.name]?.generic_params;
		const operators = aclass.operators;
		const generic_tag = generic_params? `<${generic_params.join(',')}>`:'';
		const indexed = generic_params ?
			overlay.adjust.class[aclass.name]?.indexed :
			undefined;
		const indexed_table = indexed ?
			`{[${this.format_sumneko_type(indexed.key, ()=>[`${aclass.name}.__indexkey`, ''])}]:${this.format_sumneko_type(indexed.value, ()=>[`${aclass.name}.__index`, ''])}}`:
			'';

		const generic_methods = overlay.adjust.class[aclass.name]?.generic_methods;
		const generic_bases = generic_methods?.map(m=>`{${m.name}:fun():${m.return_values.join(",")}}`);

		const bases = [indexed_table, ...generic_bases??[], ...base_classes??[]].filter(s=>!!s);

		const bases_tag = bases.length>0 ? `:${bases.join(',')}` :'';

		output.write(`---@class ${aclass.name}${generic_tag}${bases_tag}\n`);
		if (operators.find((operator)=>!["index", "length", "call"].includes(operator.name))) {
			throw "Unkown operator";
		}

		const callop = operators.find((op): op is ApiMethod&{name:"call"}=>op.name==="call");
		if (callop) {
			const params = callop.parameters.map((p, i)=>`${p.name??`param${i+1}`}${p.optional?'?':''}:${this.format_sumneko_type(p.type, ()=>[`${aclass.name}()`, ''])}`);
			const returns = ("return_values" in callop) ?
				callop.return_values.map((p, i)=>`${this.format_sumneko_type(p.type, ()=>[`${aclass.name}.__call`, ''])}`):
				undefined;

			output.write(this.convert_description_for_method(aclass.name, callop, "operator%20()"));
			output.write(`---@overload fun(${params})${returns?`:${returns}`:''}\n`);
		}


		aclass.attributes.forEach(a=>this.add_attribute(output, aclass.name, a));

		const lenop = operators.find((op): op is ApiAttribute&{name:"length"}=>op.name==="length");
		if (lenop) {
			this.add_operator(output, aclass.name, lenop);
		};

		const indexop = operators?.find?.((op):op is ApiAttribute&{name:"index"}=>op.name==="index");
		if (indexop && !overlay.adjust.class[aclass.name]?.generic_params) {
			const indexed = overlay.adjust.class[aclass.name]?.indexed;

			const opname = `[${this.format_sumneko_type(lenop?.type ?? indexed?.key ?? 'AnyBasic', ()=>[`${aclass.name}.__indexkey`, ''])}]`;
			const indexoptype = indexed?.value ?? indexop?.type;

			this.add_attribute(output, aclass.name, indexop, opname, indexoptype);
		}

		output.write(`${this.globals.get(aclass.name)?.name ?? `local ${to_lua_ident(aclass.name)}`}={\n`);
		aclass.methods.forEach(method=>{
			return this.add_method(output, aclass.name, method);
		});

		output.write("}\n\n");
	}

	private generate_sumneko_concepts(output:Writable) {
		this.docs.concepts.forEach(concept=>{
			const view_documentation_link = this.view_documentation(concept.name);
			if (typeof concept.type === "string") {
			} else {
				switch (concept.type.complex_type) {
					case "struct": //V3
					case "LuaStruct": //V4
						output.write(this.convert_sumneko_description(this.format_entire_description(concept, this.view_documentation(concept.name))));
						output.write(`---@class ${concept.name}\n`);
						concept.type.attributes.forEach(a=>this.add_attribute(output, concept.name, a));
						break;

					default:
						throw `Unknown type in concept: ${concept.type.complex_type}`;
				}
			}
		});
	}

	private readonly complex_table_type_name_lut = new Set<string>();
	private tables?:Writable;

	private add_table_type(output:Writable, type_data:ApiWithParameters, table_class_name:string, view_documentation_link:string, applies_to:string = "Applies to"): string {

		output.write(this.convert_sumneko_description(view_documentation_link));
		output.write(`---@class ${table_class_name}\n`);

		interface parameter_info{
			readonly name:string
			readonly type:ApiType
			description:string
			readonly optional?:boolean
		}
		const custom_parameter_map = new Map<string, parameter_info>();
		const custom_parameters:parameter_info[] = [];

		type_data.parameters.concat(overlay.adjust.table[table_class_name]?.parameters??[]).sort(sort_by_order).forEach((parameter, i)=>{
			const name = parameter.name;
			const custom_parameter = {name: name, type: parameter.type, order: parameter.order, description: parameter.description, optional: parameter.optional};
			custom_parameter_map.set(name, custom_parameter);
			custom_parameters.push(custom_parameter);
		});

		if (type_data.variant_parameter_groups) {
			type_data.variant_parameter_groups.sort(sort_by_order).forEach(group=>{
				group.parameters.sort(sort_by_order).forEach(parameter=>{
					let custom_description = `${applies_to} **"${group.name}"**: ${parameter.optional?"(optional)":"(required)"}${parameter.description?`\n${parameter.description}`:''}`;

					let custom_parameter = custom_parameter_map.get(parameter.name);
					if (custom_parameter) {
						custom_parameter.description = custom_parameter.description ? `${custom_parameter.description}\n\n${custom_description}` : custom_description;
					} else {
						custom_parameter = {name: parameter.name, type: parameter.type, description: custom_description, optional: parameter.optional};
						custom_parameter_map.set(parameter.name, custom_parameter);
						custom_parameters.push(custom_parameter);
					}
				});
			});
		}

		if ('complex_type' in type_data) {
			const type_data_ = type_data as Extends<ApiType, ApiWithParameters>;
			switch (type_data_.complex_type) {
				case "table":
					custom_parameters.forEach(custom_parameter=>{
						this.write_sumneko_field(
							output, custom_parameter.name, custom_parameter.type,
							()=>[`${table_class_name}.${custom_parameter.name}`, view_documentation_link],
							[custom_parameter.description, view_documentation_link], custom_parameter.optional);
					});
					break;
				case "tuple":
					let i = 1;
					custom_parameters.forEach(custom_parameter=>{
						this.write_sumneko_field(
							output, `[${i++}]`, custom_parameter.type,
							()=>[`${table_class_name}.${custom_parameter.name}`, view_documentation_link],
							[custom_parameter.description, view_documentation_link], custom_parameter.optional, custom_parameter.name);
					});
					break;
			}
		} else {
			custom_parameters.forEach(custom_parameter=>{
				this.write_sumneko_field(
					output, custom_parameter.name, custom_parameter.type,
					()=>[`${table_class_name}.${custom_parameter.name}`, view_documentation_link],
					[custom_parameter.description, view_documentation_link], custom_parameter.optional);
			});
		}

		output.write("\n");

		return table_class_name;
	}

	private resolve_internal_reference(reference:string, display_name?:string):string {
		let relative_link:string;
		reference = reference.replace(/^runtime:/, "");
		if (this.builtins.has(reference)) {
			relative_link = "Builtin-Types.html#"+reference;
		} else if (this.classes.has(reference)) {
			relative_link = reference+".html";
		} else if (this.events.has(reference)) {
			relative_link = "events.html#"+reference;
		} else if (this.defines.has(reference)) {
			relative_link = "defines.html#"+reference;
		} else {
			const matches = reference.match(/^(.*?)(\.|::)(.*)$/);
			if (!!matches) {
				const class_name = matches[1];
				const member_name = matches[3];
				const build_link = (main:string)=>`${main}.html#${class_name}.${member_name}`;
				if (this.classes.has(class_name)) {
					relative_link = build_link(class_name);
				} else if (this.concepts.has(class_name)) {
					relative_link = build_link("Concepts");
				} else {
					return "";
				}
			} else if (reference.match(/Filters$/)) {
				if (reference.match(/^Lua/)) {
					relative_link = "Event-Filters.html#"+reference;
				} else if (this.concepts.has(reference)) { // the other types of filters are just concepts
					relative_link = "Concepts.html#"+reference;
				} else {
					throw "unresolved reference";
				}
			} else if (this.concepts.has(reference)) {
				relative_link = "Concepts.html#"+reference;
			} else {
				return "";
			}
		}
		return `[${display_name??reference}](${this.runtime_api_base}${relative_link})`;
	}

	private resolve_all_links(str:string):string {
		return str.replace(/\[(.+?)\]\((.+?)\)/g, (match, display_name, link)=>{
			if (link.match(/^http(s?):\/\//)) {
				return `[${display_name}](${link})`;
			} else if (link.match(/\.html($|#)/)) {
				return `[${display_name}](${this.runtime_api_base}${link})`;
			} else {
				return this.resolve_internal_reference(link, display_name);
			}
		});
	}

	private view_documentation(reference:string):string {
		return this.resolve_internal_reference(reference, "View documentation");
	}

	private preprocess_description(description:string):string {
		const escape_single_newline = (str:string)=>{
			return this.resolve_all_links(str.replace(/([^\n])\n([^\n])/g, "$1  \n$2"));
		};

		const result = [];
		for (const match of description.matchAll(/((?:(?!```).)*)($|```(?:(?!```).)*```)/gs)) {
			result.push(escape_single_newline(match[1]));
			if (match[2]) {
				result.push(match[2]);
			}
		}
		return result.join("");
	}

	private convert_sumneko_description(...descriptionParts:string[]):string {
		const description = descriptionParts.filter(s=>!!s).join("\n\n");
		if (!description) {
			return "";
		}
		return `---${this.preprocess_description(description).replace(/\n/g, "\n---")}\n`;
	}

	private format_sumneko_type(api_type:ApiType|undefined, get_table_name_and_view_doc_link:()=>[string, string], add_doc_links?: boolean):string {
		const wrap = add_doc_links ? (x:string)=>this.resolve_internal_reference(x) : (x:string)=>x;

		const modify_getter = (table_name_appended_str:string)=>():[string, string]=>{
			const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();
			return [table_class_name+table_name_appended_str, view_documentation_link];
		};

		if (!api_type) { return "any"; }
		if (typeof api_type === "string") { return wrap(api_type); }

		switch (api_type.complex_type) {
			case "array":
				if (typeof api_type.value === "object") {
					switch (api_type.value.complex_type) {
						case "union":
							return `(${this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link)})[]`;

						default:
							// default format
							break;
					}
				}
				return this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link)+"[]";
			case "dictionary":
				return `{[${this.format_sumneko_type(api_type.key, modify_getter("_key"))}]: ${this.format_sumneko_type(api_type.value, modify_getter("_value"))}}`;
			case "union":
				return api_type.options.map((o, i)=>this.format_sumneko_type(o, modify_getter("."+i))).join("|");
			case "LuaLazyLoadedValue":
				return `${wrap("LuaLazyLoadedValue")}<${this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link)}>`;
			case "LuaCustomTable":
				return `${wrap("LuaCustomTable")}<${this.format_sumneko_type(api_type.key, modify_getter("_key"))},${this.format_sumneko_type(api_type.value, modify_getter("_value"))}>`;
			case "table":
			case "tuple":
			{
				const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();

				if (this.complex_table_type_name_lut.has(table_class_name)) { return table_class_name; }

				this.complex_table_type_name_lut.add(table_class_name);
				if (!this.tables) { throw new Error("table_types not ready"); }
				return this.add_table_type(this.tables, api_type, table_class_name, view_documentation_link);
			}
			case "function":
				if (api_type.parameters.length === 0 ) {
					return `function`;
				} else {
					return `fun(${api_type.parameters.map((p, i)=>`param${i+1}:${this.format_sumneko_type(p, modify_getter(`_param${i+1}`))}`).join(",")})`;
				}
			case "literal":
				switch (typeof api_type.value) {
					case "number":
					case "boolean":
						return `${api_type.value}`;
					case "string":
						return `"${api_type.value}"`;
				}
			case "type":
				//TODO: do something with the description?
				// at least for inside described enums?
				return this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link);

			case "LuaStruct": // V4
			case "struct": // V3
				// struct only appears in concepts which handle them more directly
			default:
				return "error";
		}
	}

	private format_entire_description(obj:ApiWithNotes&{readonly description:string; readonly subclasses?:string[]; readonly raises?: ApiEventRaised[]}, view_documentation_link:string, description?:string) {
		return [
			description??obj.description,
			obj.notes?.map(note=>`**Note:** ${note}`)?.join("\n\n"),
			obj.raises && (
				`**Events:**\n${
					obj.raises?.map(raised=>` * ${raised.optional?"May":"Will"} raise ${this.resolve_internal_reference(raised.name)} ${{instantly: "instantly", current_tick: "later in the current tick", future_tick: "in a future tick"}[raised.timeframe]}.${raised.description?"\n"+raised.description:""}`,)?.join("\n\n") }`
			),
			view_documentation_link,
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