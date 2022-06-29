import { WorkspaceConfiguration } from "vscode";
import { WritableStream as WritableMemoryStream } from "memory-streams";
import { overlay } from "./Overlay";

function extend_string(param:{
	pre?:string		// if str is not empty this will be preprended
	str:string		// the part to concat which may be empty ("")
	post?:string	// if str is not empty this will be appended

	//if str is empty this will be used, pre and post will not be applied however
	fallback?:string
}):string {
	if (!param.str) {
		return param.fallback ?? "";
	} else {
		return `${param.pre??""}${param.str}${param.post??""}`;
	}
}

function escape_lua_keyword(str:string) {
	const keywords = ["and", "break", "do", "else", "elseif", "end", "false", "for",
		"function", "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
		"then", "true", "until", "while"];
	return keywords.includes(str)?`${str}_`:str;
}

function to_lua_ident(str:string) {
	return escape_lua_keyword(str.replace(/[^a-zA-Z0-9]/g,"_").replace(/^([0-9])/,"_$1"));
}

function sort_by_order(a:{order:number},b:{order:number}) {
	return a.order - b.order;
}

export class ApiDocGenerator {
	private readonly docs:ApiDocs;

	private readonly classes:Map<string,ApiClass>;
	private readonly events:Map<string,ApiEvent>;
	private readonly concepts:Map<string,ApiConcept>;
	private readonly builtins:Map<string,ApiBuiltin>;
	private readonly globals:Map<string,ApiGlobalObject>;

	private readonly defines:Set<string>;

	//TODO: version
	private readonly runtime_api_base:string;

	constructor(docjson:string, private readonly docsettings:WorkspaceConfiguration) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw `Unknown application: ${this.docs.application}`;
		}

		if (!(this.docs.api_version===1 || this.docs.api_version===2)) {
			throw `Unsupported JSON Version ${(<ApiDocs>this.docs).api_version}`;
		}

		if (this.docs.stage !== "runtime") {
			throw `Unknown stage: ${this.docs.stage}`;
		}

		switch (docsettings.get("docLinksVerion")) {
			case "latest":
			default:
				this.runtime_api_base = "https://lua-api.factorio.com/latest/";
				break;
			case "current":
				this.runtime_api_base = `https://lua-api.factorio.com/${this.docs.application_version}/`;
				break;
		}

		this.classes = new Map(this.docs.classes.map(c => [c.name,c]));
		this.events = new Map(this.docs.events.map(c => [c.name,c]));
		this.concepts = new Map(this.docs.concepts.map(c => [c.name,c]));
		this.builtins = new Map(this.docs.builtin_types.map(c => [c.name,c]));

		this.globals = new Map(this.docs.global_objects.map(g => [
				this.format_sumneko_type(g.type,()=>{
						throw "complex global";
					}),
				g
			]));


		const add_define = (define:ApiDefine,name_prefix:string)=>{
			const name = `${name_prefix}${define.name}`;
			this.defines.add(name);
			const child_prefix = `${name}.`;
			if (define.values) {
				define.values.forEach(value=>{
					this.defines.add(`${child_prefix}${value.name}`);
				});
			}
			if (define.subkeys) {
				define.subkeys.forEach(subkey=>add_define(subkey,child_prefix));
			}
		};

		this.defines = new Set<string>();
		this.defines.add("defines");
		this.docs.defines.forEach(define=>add_define(define,"defines."));
	}

	public get api_version() : ApiDocs["api_version"] {
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

	private with_base_classes<T>(c:ApiClass, getter:(c:ApiClass)=>T) {
		const own = getter(c);
		const bases = c.base_classes
			?.map(b=>this.classes.get(b))
			.filter(b=>!!b)
			.map(getter) ?? [];

		return [own, ...bases].flat();
	}

	public generate_debuginfo() {
		const debuginfo = {
			eventlike: {
				__index: {} as {[classname:string]:{[methodname:string]:true}},
				__newindex: {} as {[classname:string]:{[propname:string]:true}},
			},
			alwaysValid:{} as {[classname:string]:true},
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
					if (attribute.read)
					{
						cc[attribute.name] = {};
						if (!attribute.write) {
							cc[attribute.name].readOnly = true;
						}
						if (typeof attribute.type === "string" && attribute.type.startsWith("defines.")) {
							cc[attribute.name].enumFrom = attribute.type;
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
				switch (this.docs.api_version) {
					case 1:
						//const m1 = method as ApiMethodV1;
						// no fetchable props with v1 json, can't check for raises
						break;

					case 2:
						const m2 = method as ApiMethodV2;
						if (m2.return_values.length === 0) { continue; }
						if (m2.raises) { continue; }
						cc[m2.name] = {
							readOnly: true,
							fetchable: true,
						};
						break;
					default:
						break;
				}
			}

		});

		return debuginfo;
	}

	public async generate_sumneko_docs(writeFile:(filename:string,buff:Buffer)=>any) {
		return (await Promise.all([
		this.generate_sumneko_section("builtin",writeFile),
		this.generate_sumneko_section("defines",writeFile),
		this.generate_sumneko_section("events",writeFile),
		this.generate_sumneko_classes(writeFile),
		this.generate_sumneko_section("custom",writeFile),
		this.generate_sumneko_section("table_types",writeFile),
		this.generate_sumneko_section("concepts",writeFile),
		])).reduce((a,b)=>Math.max(a,b));
	}

	private async generate_sumneko_section(name:"builtin"|"defines"|"events"|"custom"|"table_types"|"concepts", writeFile:(filename:string,buff:Buffer)=>any) {
		const ms = new WritableMemoryStream();
		this.generate_sumneko_header(ms,name);
		this[`generate_sumneko_${name}`](ms);
		ms.write(`\n`);
		const buff = ms.toBuffer();
		await writeFile(`runtime-api-${name}.lua`,buff);
		return buff.length;
	}

	private generate_sumneko_header(output:WritableMemoryStream, name:string) {
		output.write(`---@meta\n`);
		output.write(`---@diagnostic disable\n`);
		output.write(`\n`);
		output.write(`--$Factorio ${this.docs.application_version}\n`);
		output.write(`--$Overlay ${overlay.version}\n`);
		output.write(`--$Section ${name}\n`);
		output.write(`-- This file is automatically generated. Edits will be overwritten.\n`);
		output.write(`\n`);
	}

	private generate_sumneko_builtin(output:WritableMemoryStream) {
		this.docs.builtin_types.forEach(builtin=>{
			if (!(["string","boolean","table","nil"].includes(builtin.name))) {
				output.write(this.convert_sumneko_description(
					extend_string({str:builtin.description, post:"\n\n"}) + this.view_documentation(builtin.name)
					));
				const numberType = this.docsettings.get("useInteger",true) && builtin.name.match(/int/) ? "integer" : "number";
				switch (this.docsettings.get("numberStyle")) {
					case "alias":
						output.write(`---@alias ${builtin.name} ${numberType}\n\n`);
						break;
					case "class":
					default:
						output.write(`---@class ${builtin.name}:${numberType}\n\n`);
						break;
				}
			}
		});
	}
	private generate_sumneko_defines(output:WritableMemoryStream) {
		output.write(this.convert_sumneko_description(this.view_documentation("defines")));
		output.write("---@class defines\n");
		output.write("defines={}\n\n");

		const generate = (define:ApiDefine,name_prefix:string) => {
			const name = `${name_prefix}${define.name}`;
			const doctext = this.convert_sumneko_description(
				extend_string({str: define.description, post: "\n\n"})+this.view_documentation(name)
			);
			output.write(doctext);
			output.write(`---@class ${name}\n`);

			if (define.values) {
				define.values.forEach(value=>{
					output.write(this.convert_sumneko_description(
						extend_string({str: value.description, post: "\n\n"})+this.view_documentation(`${name}.${value.name}`)
						));
					output.write(`---@class ${name}.${to_lua_ident(value.name)} : ${name} \n`);
				});
			}

			const adjust = overlay.adjust.define[name];
			let indextag = "";
			if (adjust?.subkeys) {
				indextag = ": " + adjust.subkeys
					.map(s=>({start:`{[${s}]:`, end:`}`}))
					.reduceRight((s,c)=>`${c.start}${s}${c.end}`,"0");
			}

			output.write(doctext);
			output.write(`---@class ${name}.__index${indextag}\n`);
			const child_prefix = `${name}.`;
			if (define.values) {
				define.values.forEach(value=>{
					output.write(`---@field ${to_lua_ident(value.name)} ${name}.${to_lua_ident(value.name)} \n`);
				});
			}
			output.write(`${name}={}\n`);
			if (define.subkeys) {
				define.subkeys.forEach(subkey=>generate(subkey,child_prefix));
			}
		};

		this.docs.defines.forEach(define=>generate(define,"defines."));
	}
	private generate_sumneko_events(output:WritableMemoryStream) {
		this.docs.events.forEach(event=>{
			output.write(`---@alias ${event.name} EventData.${event.name}\n`);
			const view_documentation_link = this.view_documentation(event.name);
			output.write(this.convert_sumneko_description(this.format_entire_description(event,view_documentation_link)));
			output.write(`---@class EventData.${event.name} : EventData\n`);
			event.data.forEach(param=>{
				output.write(this.convert_sumneko_description(extend_string({str: param.description, post: "\n\n"}) + view_documentation_link));
				output.write(`---@field ${param.name} ${this.format_sumneko_type(param.type,()=>[`${event.name}.${param.name}`, view_documentation_link])}`);
				output.write(param.optional?"|nil\n":"\n");
			});
			output.write("\n");
		});
	}
	private async generate_sumneko_classes(writeFile:(filename:string,buff:Buffer)=>any) {
		const classSizes = this.docs.classes.map(async aclass=>{
			const ms = new WritableMemoryStream();
			this.generate_sumneko_header(ms,aclass.name);
			this.add_sumneko_class(ms,aclass);
			ms.write(`\n`);
			const buff = ms.toBuffer();
			await writeFile(`runtime-api-${aclass.name}.lua`,buff);
			return buff.length;
		});

		return Math.max(...await Promise.all(classSizes));
	}

	private add_sumneko_class(output:WritableMemoryStream,aclass:ApiClass):void;
	private add_sumneko_class(output:WritableMemoryStream,aclass:ApiStructConcept):void;
	private add_sumneko_class(output:WritableMemoryStream,aclass:ApiClass|ApiStructConcept):void {
		const add_attribute = (attribute:ApiAttribute,oper_lua_name?:string,oper_html_name?:string)=>{
			const aname = oper_lua_name ?? attribute.name;
			const view_doc_link = this.view_documentation(`${aclass.name}::${oper_html_name ?? aname}`);
			output.write(this.convert_sumneko_description(this.format_entire_description(
				attribute, view_doc_link, `[${attribute.read?"R":""}${attribute.write?"W":""}]${extend_string({pre:"\n", str:attribute.description})}`
			)));
			output.write(`---@field ${aname} ${this.format_sumneko_type(attribute.type, ()=>[`${aclass.name}.${aname}`,view_doc_link])}\n`);
		};

		const view_documentation_for_method = (method_name:string)=>{
			return this.view_documentation(`${aclass.name}::${method_name}`);
		};

		const convert_param_or_return = (api_type:ApiType|undefined, description:string|undefined, get_table_name_and_view_doc_link:()=>[string,string]):string =>{
			const formatted_type = this.format_sumneko_type(api_type,get_table_name_and_view_doc_link);
			if (!description) {
				return `${formatted_type}\n`;
			} else if (!description.includes("\n")) {
				return `${formatted_type}@${this.preprocess_description(description)}\n`;
			} else {
				return `${formatted_type}@\n${this.convert_sumneko_description(description)}`;
			}
		};

		const add_return_annotation = (method:ApiMethod)=>{
			if ("return_type" in method) { // v1
				output.write(`---@return ${convert_param_or_return(method.return_type,method.return_description,()=>[
					`${aclass.name}.${method.name}_return`, view_documentation_for_method(method.name)
				])}`);
			}
			if ("return_values" in method) { // v2
				method.return_values.forEach((rv)=>{
					output.write(`---@return ${convert_param_or_return(rv.type,rv.description,()=>[
						`${aclass.name}.${method.name}_return`, view_documentation_for_method(method.name)
					])}`);
				});
			}
		};

		const convert_description_for_method = (method:ApiMethod,html_name?:string)=>
			this.convert_sumneko_description(this.format_entire_description(method,view_documentation_for_method(html_name??method.name)));

		const add_regular_method = (method:ApiMethod,oper_lua_name?:string,oper_html_name?:string)=>{
			output.write(convert_description_for_method(method,oper_html_name));
			const sorted_params = method.parameters.sort(sort_by_order);
			sorted_params.forEach(parameter=>{
				output.write(`---@param ${escape_lua_keyword(parameter.name)}${parameter.optional?"?":" "}`);
				output.write(convert_param_or_return(parameter.type,parameter.description,()=>[
					`${aclass.name}.${method.name}.${parameter.name}`, view_documentation_for_method(method.name)
				]));
			});
			if (method.variadic_type) {
				output.write(`---@vararg ${this.format_sumneko_type(method.variadic_type,()=>[`${aclass.name}.${method.name}_vararg`, view_documentation_for_method(method.name)])}\n`);
				if (method.variadic_description) {
					output.write(this.convert_sumneko_description(`\n**vararg**: ${method.variadic_description.includes("\n")?"\n\n":""}${method.variadic_description}`));
				}
			}
			add_return_annotation(method);

			output.write(`${oper_lua_name??method.name}=function(${sorted_params.map(p=>escape_lua_keyword(p.name)).concat(method.variadic_type?["..."]:[]).join(",")})end,\n`);
		};

		const add_method_taking_table = (method:ApiMethod)=>{
			const param_class_name = `${aclass.name}.${method.name}_param`;
			this.add_table_type(output,method,param_class_name,this.view_documentation(`${aclass.name}::${method.name}`));
			output.write("\n");
			output.write(convert_description_for_method(method));
			output.write(`---@param param${method.table_is_optional?"?":" "}${param_class_name}\n`);
			add_return_annotation(method);
			output.write(`${method.name}=function(param)end,\n`);
		};

		const add_method = (method:ApiMethod)=> method.takes_table?add_method_taking_table(method):add_regular_method(method);

		const needs_label = !!(aclass.description || aclass.notes);
		output.write(this.convert_sumneko_description(this.format_entire_description(
			aclass, this.view_documentation(aclass.name),
			extend_string({
				pre: "**Global Description:**\n",
				str: this.globals.get(aclass.name)?.description ?? "",
				post: (needs_label?"\n\n**Class Description:**\n":"\n\n")+aclass.description,
				fallback: aclass.description,
			})
		)));
		if ('category' in aclass) {
			output.write(`---@class ${aclass.name}\n`);
		} else {
			const base_classes = aclass.base_classes ?? ["LuaObject"];
			const generic_params = overlay.adjust.class[aclass.name]?.generic_params;
			const operators = aclass.operators as ApiOperator[];
			const indexop = operators?.find?.(op=>op.name==="index") as ApiAttribute|undefined;
			const indexed = overlay.adjust.class[aclass.name]?.indexed;

			const generic_tag = generic_params? `<${generic_params.join(',')}>`:'';

			const indexed_table = indexed || indexop ?
				`{[${this.format_sumneko_type(indexed?.key??'AnyBasic', ()=>[`${aclass.name}.__indexkey`, ''])}]:${this.format_sumneko_type(indexed?.value??indexop?.type, ()=>[`${aclass.name}.__index`, ''])}}`:
				'';

			const generic_methods = overlay.adjust.class[aclass.name]?.generic_methods;
			const generic_bases = generic_methods?.map(m=>`{${m.name}:fun():${m.return_values.join(",")}}`);

			const bases = [indexed_table, ...generic_bases??[], ...base_classes??[]].filter(s=>!!s);

			const bases_tag = bases.length>0 ? `:${bases.join(',')}` :'';

			const callable_tag = operators.find(op=>op.name==="call") ? '.__index' : '';

			output.write(`---@class ${aclass.name}${callable_tag}${generic_tag}${bases_tag}\n`);
			if(operators.find((operator)=>!["index","length","call"].includes(operator.name))){
					throw "Unkown operator";
			}
		}

		aclass.attributes.forEach(a=>add_attribute(a));

		if (!('category' in aclass)) {
			const operators = <ApiOperator[]>aclass.operators;
			const lenop = operators.find(op=>op.name==="length") as ApiAttribute|undefined;
			if (lenop) {
				add_attribute(lenop,"__len","operator%20#");
			};

			output.write(`${this.globals.get(aclass.name)?.name ?? `local ${to_lua_ident(aclass.name)}`}={\n`);
			aclass.methods.forEach(method=>{
				return add_method(method);
			});

			output.write("}\n\n");

			const callop = operators.find(op=>op.name==="call") as ApiMethod;
			if (callop){
				const params = callop.parameters.map((p,i)=>`${p.name??`param${i+1}`}${p.optional?'?':''}:${this.format_sumneko_type(p.type,()=>[`${aclass.name}()`, ''])}`);
				const returns = ("return_values" in callop) ?
					callop.return_values.map((p,i)=>`${this.format_sumneko_type(p.type,()=>[`${aclass.name}.__call`, ''])}`):
					undefined;

				output.write(convert_description_for_method(callop,"operator%20()"));
				output.write(`---@alias ${aclass.name}.__call fun(${params})${returns?`:${returns}`:''}\n`);
				output.write(`---@alias ${aclass.name} ${aclass.name}.__index|${aclass.name}.__call\n\n`);
			}
		}
	}

	private generate_sumneko_concepts(output:WritableMemoryStream) {
		this.docs.concepts.forEach(concept=>{
			const view_documentation_link = this.view_documentation(concept.name);
			switch (concept.category) {
				case "union":
					const sorted_options = concept.options.sort(sort_by_order);
					const get_table_name_and_view_doc_link = (option:ApiUnionConcept["options"][0]):[string,string]=>{
						return [`${concept.name}.${option.order}`, view_documentation_link];
					};
					output.write(this.convert_sumneko_description(this.format_entire_description(
						concept, view_documentation_link,
						`${extend_string({str:concept.description, post:"\n\n"})
						}May be specified in one of the following ways:${
							sorted_options.map(option=>`\n- ${
								this.format_sumneko_type(option.type, ()=>get_table_name_and_view_doc_link(option), true)
							}${extend_string({pre:": ",str:option.description})}`)
						}`
					)));
					output.write(`---@alias ${concept.name} `);
					output.write(sorted_options.map(option=>this.format_sumneko_type(option.type, ()=>get_table_name_and_view_doc_link(option))).join("|"));
					output.write("\n\n");
					break;
				case "concept":
					output.write(this.convert_sumneko_description(this.format_entire_description(concept,this.view_documentation(concept.name))));
					output.write(`---@alias ${concept.name} any\n\n`);
					break;
				case "struct":
					this.add_sumneko_class(output, concept);
					break;
				case "flag":
					output.write(this.convert_sumneko_description(this.format_entire_description(concept,view_documentation_link)));
					output.write(`---@class ${concept.name}\n`);
					concept.options.forEach(option=>{
						output.write(this.convert_sumneko_description(
							extend_string({str:option.description, post:"\n\n"})+
							view_documentation_link
							));
						output.write(`---@field ${option.name} boolean|nil\n`);
					});
					output.write("\n");
					break;
				case "table":
					this.add_table_type(output, concept, concept.name, this.view_documentation(concept.name));
					break;
				case "table_or_array":
					this.add_table_type(output, concept, concept.name, this.view_documentation(concept.name));
					break;
				case "enum":
					output.write(this.convert_sumneko_description(this.format_entire_description(
						concept, this.view_documentation(concept.name),[
							concept.description, "Possible values are:",
							...concept.options.sort(sort_by_order).map(option=>
								`\n- "${option.name}"${extend_string({pre:" - ",str:option.description})}`)
						].filter(s=>!!s).join("")
					)));
					output.write(`---@class ${concept.name}\n\n`);
					break;
				case "filter":
					this.add_table_type(output,concept,concept.name,this.view_documentation(concept.name), "Applies to filter");
					break;
				default:
					throw `Unknown concept category: ${concept}`;
			}
		});
	}
	private generate_sumneko_custom(output:WritableMemoryStream) {
		overlay.custom.forEach(table=>this.add_table_type(output,table,table.name,""));
	}
	private generate_sumneko_table_types(output:WritableMemoryStream) {
		output.write(this.tablebuff.toBuffer());
	}

	private readonly complex_table_type_name_lut = new Set<string>();
	private tablebuff = new WritableMemoryStream();

	private add_table_type(output:WritableMemoryStream, type_data:ApiWithParameters, table_class_name:string, view_documentation_link:string, applies_to:string = "Applies to"): string
	{

		output.write(this.convert_sumneko_description(view_documentation_link));
		output.write(`---@class ${table_class_name}\n`);

		interface parameter_info{
			readonly name:string
			readonly type:ApiType
			readonly order:number
			description:string
			readonly optional?:boolean
		}
		const custom_parameter_map = new Map<string, parameter_info>();
		const custom_parameters:parameter_info[] = [];

		type_data.parameters.concat(overlay.adjust.table[table_class_name]?.parameters??[]).sort(sort_by_order).forEach((parameter,i)=>{
			const name = parameter.name;
			const custom_parameter = {name:name, type:parameter.type, order:parameter.order, description:parameter.description, optional:parameter.optional};
			custom_parameter_map.set(name, custom_parameter);
			custom_parameters.push(custom_parameter);
		});

		if (type_data.variant_parameter_groups)
		{
			type_data.variant_parameter_groups.concat(overlay.adjust.table[table_class_name]?.variant_parameter_groups??[]).sort(sort_by_order).forEach(group=>{
				group.parameters.sort(sort_by_order).forEach(parameter => {
					let custom_description = `${applies_to} **"${group.name}"**: ${parameter.optional?"(optional)":"(required)"}${extend_string({pre:"\n", str:parameter.description})}`;

					let custom_parameter = custom_parameter_map.get(parameter.name);
					if (custom_parameter)
					{
						custom_parameter.description = extend_string({
						str: custom_parameter.description, post: "\n\n"
						})+custom_description;
					} else {
						custom_parameter = {name:parameter.name, type:parameter.type, order:parameter.order, description:custom_description, optional:parameter.optional};
						custom_parameter_map.set(parameter.name, custom_parameter);
						custom_parameters.push(custom_parameter);
					}
				});
			});
		}

		custom_parameters.forEach(custom_parameter=>{
			output.write(this.convert_sumneko_description(extend_string({str: custom_parameter.description, post: "\n\n"})+view_documentation_link));
			output.write(`---@field ${custom_parameter.name} ${this.format_sumneko_type(custom_parameter.type, ()=>
				[`${table_class_name}.${custom_parameter.name}`, view_documentation_link])}`);
			output.write((custom_parameter.optional? "|nil\n":"\n"));
		});

		if ('category' in type_data && (type_data as ApiConcept).category === "table_or_array") {
			let i = 1;
			custom_parameters.forEach(custom_parameter=>{
				output.write(this.convert_sumneko_description(extend_string({str: custom_parameter.description, post: "\n\n"})+view_documentation_link));
				output.write(`---@field [${i++}] ${this.format_sumneko_type(custom_parameter.type, ()=>
					[`${table_class_name}.${custom_parameter.name}`, view_documentation_link])}`);
				if (custom_parameter.optional) { output.write("|nil"); }
				output.write(` ${custom_parameter.name} \n`);
			});
		}

		output.write("\n");

		return table_class_name;
	}

	private resolve_internal_reference(reference:string, display_name?:string):string
	{
		let relative_link:string;
		if (this.builtins.has(reference)) {
			relative_link = "Builtin-Types.html#"+reference;
		} else if (this.classes.has(reference)) {
			relative_link = reference+".html";
		} else if (this.events.has(reference)) {
			relative_link = "events.html#"+reference;
		} else if (this.defines.has(reference)) {
			relative_link = "defines.html#"+reference;
		} else {
			const matches = reference.match(/^(.*?)::(.*)$/);
			if (!!matches) {
				const class_name = matches![1];
				const member_name = matches![2];
				const build_link = (main:string)=> `${main}.html#${class_name}.${member_name}`;
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
		return str.replace(/\[(.+?)\]\((.+?)\)/g,(match,display_name,link)=>{
			if (link.match(/^http(s?):\/\//)) {
				return `[${display_name??link}](${link})`;
			} else if (link.match(/\.html($|#)/)) {
				return `[${display_name??link}](${this.runtime_api_base}${link})`;
			} else {
				return this.resolve_internal_reference(link,display_name);
			}
		});
	}

	private view_documentation(reference:string):string {
		return this.resolve_internal_reference(reference, "View documentation");
	}

	private preprocess_description(description:string):string {
		const escape_single_newline = (str:string) => {
			return this.resolve_all_links(str.replace(/([^\n])\n([^\n])/g,"$1  \n$2"));
		};

		let result = new WritableMemoryStream();

		for (const match of description.matchAll(/((?:(?!```).)*)($|```(?:(?!```).)*```)/gs)) {
			result.write(escape_single_newline(match[1]));
			if (match[2]) {
				result.write(match[2]);
			}
		}
		return result.toString();
	}

	private convert_sumneko_description(description:string):string {
		if (!description) {
			return "";
		}
		return `---${this.preprocess_description(description).replace(/\n/g,"\n---")}\n`;
	}

	private format_sumneko_type(api_type:ApiType|undefined,get_table_name_and_view_doc_link:()=>[string,string], add_doc_links?: boolean):string
	{
		const wrap = add_doc_links ? (x:string)=>this.resolve_internal_reference(x) : (x:string)=>x;

		const modify_getter = (table_name_appended_str:string) => ():[string,string] => {
			const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();
			return [table_class_name+table_name_appended_str, view_documentation_link];
		};

		if (!api_type) { return "any"; }
		if (typeof api_type === "string") { return wrap(api_type); }

		switch (api_type.complex_type) {
			case "array":
				return this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link)+"[]";
			case "dictionary":
				return `{[${this.format_sumneko_type(api_type.key, modify_getter("_key"))}]: ${this.format_sumneko_type(api_type.value, modify_getter("_value"))}}`;
			case "variant":
				return api_type.options.map((o,i)=> this.format_sumneko_type(o,modify_getter("."+i))).join("|");
			case "LuaLazyLoadedValue":
				return `${wrap("LuaLazyLoadedValue")}<${this.format_sumneko_type(api_type.value, get_table_name_and_view_doc_link)}>`;
			case "LuaCustomTable":
				return `${wrap("LuaCustomTable")}<${this.format_sumneko_type(api_type.key, modify_getter("_key"))},${this.format_sumneko_type(api_type.value, modify_getter("_value"))}>`;
			case "table":
				const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();

				if (this.complex_table_type_name_lut.has(table_class_name)) {return table_class_name;}

				this.complex_table_type_name_lut.add(table_class_name);
				return this.add_table_type(this.tablebuff,api_type, table_class_name, view_documentation_link);
			case "function":
				return `fun(${api_type.parameters.map((p,i)=>`param${i+1}:${this.format_sumneko_type(p,modify_getter(`_param${i+1}`))}`).join(",")})`;
		}
	}

	private format_entire_description(obj:ApiWithNotes&{readonly description:string; readonly subclasses?:string[]; readonly raises?: ApiEventRaised[]}, view_documentation_link:string, description?:string)
	{
		return [
			description??obj.description,
			obj.notes?.map(note=>`**Note:** ${note}`)?.join("\n\n"),
			obj.raises && (
				`**Events:**\n${
					obj.raises?.map(raised=>` * ${raised.optional?"May":"Will"} raise ${this.resolve_internal_reference(raised.name)} ${{instantly:"instantly", current_tick:"later in the current tick", future_tick:"in a future tick"}[raised.timeframe]}.${raised.description?"\n"+raised.description:""}`,)?.join("\n\n") }`
			),
			view_documentation_link,
			obj.examples?.map(example=>`### Example\n${example}`)?.join("\n\n"),
			obj.subclasses && (
				`_Can only be used if this is ${
					obj.subclasses.length === 1 ? obj.subclasses[0] :
					`${obj.subclasses.slice(0,-1).join(", ")} or ${obj.subclasses[obj.subclasses.length-1]}`
				}_`
			),
			obj.see_also && `### See also\n${obj.see_also.map(sa=>`- ${this.resolve_internal_reference(sa)}`).join("\n")}`,
			].filter(s=>!!s).join("\n\n");
	}
}