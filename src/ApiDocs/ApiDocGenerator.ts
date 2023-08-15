import { overlay } from "./Overlay";
import { version as bundleVersion } from "../../package.json";
import type { WriteStream } from "fs";
import type { Writable } from "stream";

type ApiBuiltinCustom =
	{kind:"none"} |
	{kind:"alias"; base:string} |
	{kind:"class"; base:string[]; operators?:boolean};

export interface DocSettings {
	docLinksVersion?:"latest"|"current"
	signedUMinus?:boolean
	builtinOperators?:boolean
	builtinCustomStyle?:{[k:string]:ApiBuiltinCustom}
	useInteger?:boolean
	numberStyle?:"alias"|"class"|"aliasNative"
}

function escape_lua_keyword(str:string) {
	const keywords = ["and", "break", "do", "else", "elseif", "end", "false", "for",
		"function", "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
		"then", "true", "until", "while"];
	return keywords.includes(str)?`${str}_`:str;
}

function to_lua_ident(str:string) {
	return escape_lua_keyword(str.replace(/[^a-zA-Z0-9]/g, "_").replace(/^([0-9])/, "_$1"));
}

function sort_by_order(a:{order:number}, b:{order:number}) {
	return a.order - b.order;
}

export class ApiDocGenerator<V extends ApiVersions = ApiVersions> {
	private readonly docs:ApiDocs<V>;

	private readonly classes:Map<string, ApiClass<V>>;
	private readonly events:Map<string, ApiEvent<V>>;
	private readonly concepts:Map<string, ApiConcept<V>>;
	private readonly builtins:Map<string, ApiBuiltin>;
	private readonly globals:Map<string, ApiGlobalObject>;

	private readonly defines:Set<string>;

	private readonly runtime_api_base:string;

	constructor(docjson:string, private readonly docsettings:DocSettings) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw `Unknown application: ${this.docs.application}`;
		}

		if (!(this.docs.api_version===3 || this.docs.api_version===4)) {
			throw `Unsupported JSON Version ${this.docs.api_version}`;
		}

		if (this.docs.stage !== "runtime") {
			throw `Unknown stage: ${this.docs.stage}`;
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

	private with_base_classes<T>(c:ApiClass<V>, getter:(c:ApiClass<V>)=>T) {
		const own = getter(c);
		const bases = c.base_classes
			?.map(b=>this.classes.get(b))
			.filter((b):b is ApiClass<V>=>!!b)
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
				switch (this.docs.api_version) {
					case 3:
					case 4:
						if (method.return_values.length === 0) { continue; }
						if (method.raises) { continue; }
						cc[method.name] = {
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

	public generate_sumneko_docs(createWriteStream:(filename:string)=>WriteStream) {
		const tables = createWriteStream(`runtime-api-table_types.lua`);
		this.tables = tables;

		this.generate_sumneko_section("builtin", createWriteStream);
		this.generate_sumneko_section("defines", createWriteStream);
		this.generate_sumneko_section("events", createWriteStream);
		this.generate_sumneko_classes(createWriteStream);
		this.generate_sumneko_section("LuaObjectNames", createWriteStream);
		this.generate_sumneko_section("concepts", createWriteStream);
		this.generate_sumneko_section("global_functions", createWriteStream);

		tables.close();
		this.tables = undefined;
	}

	private generate_sumneko_section(name:"builtin"|"defines"|"events"|"LuaObjectNames"|"concepts"|"global_functions", createWriteStream:(filename:string)=>WriteStream) {
		const fs = createWriteStream(`runtime-api-${name}.lua`);
		this.generate_sumneko_header(fs, name);
		this[`generate_sumneko_${name}`](fs);
		fs.write(`\n`);
		fs.close();
	}

	private generate_sumneko_header(output:Writable, name:string) {
		output.write(`---@meta\n`);
		output.write(`---@diagnostic disable\n`);
		output.write(`\n`);
		output.write(`--$Factorio ${this.docs.application_version}\n`);
		output.write(`--$Generator ${bundleVersion}\n`);
		output.write(`--$Section ${name}\n`);
		output.write(`-- This file is automatically generated. Edits will be overwritten.\n`);
		output.write(`\n`);
	}


	private builtin_type_info(builtin:ApiBasicMember) :
		{type:"number"|"integer"|"unsigned"; size:number}|undefined {
		switch (builtin.name) {
			case "string":
			case "boolean":
			case "table":
			case "nil":
				// these are all *real* lua types, so nothing to do here
				return undefined;

			case "LuaObject":
				// skip the builtin to use the class from Overlay instead
				return undefined;

			case "double":
				return {type: "number", size: 64};
			case "float":
				return {type: "number", size: 32};

			default:
				//try to parse integer types...
				const matches = builtin.name.match(/(u?)int(\d*)/);
				if (!matches) { return undefined; }
				const type = matches[1] === 'u' ? "unsigned" : "integer";
				const size = matches[2] ? Number.parseInt(matches[2], 10) : 32;
				return {type: type, size: size};
		}
	}

	private add_alias_builtin(output:Writable, name:string, base:string) {
		output.write(`---@alias ${name} ${base}\n\n`);
	}

	private add_all_math_operators(output:Writable, result_type:string) {
		output.write(`---@operator unm:${(this.docsettings.signedUMinus ?? true) && result_type.startsWith("uint")?result_type.substring(1):result_type}\n`);
		output.write(`---@operator mod:${result_type}\n`);
		output.write(`---@operator add:${result_type}\n`);
		output.write(`---@operator div:${result_type}\n`);
		output.write(`---@operator sub:${result_type}\n`);
		output.write(`---@operator mul:${result_type}\n`);
	}

	private add_class_builtin(output:Writable, name:string, base:string[], with_operators:boolean = true) {
		output.write(`---@class ${name}${base.length>0?":":""}${base.join(",")}\n`);
		if (with_operators && (this.docsettings.builtinOperators ?? true)) {
			this.add_all_math_operators(output, name);
		}
		output.write(`\n`);
	}

	private generate_sumneko_builtin(output:Writable) {
		this.docs.builtin_types.forEach(builtin=>{
			const custom = this.docsettings.builtinCustomStyle?.[builtin.name];
			if (custom) {
				if (custom.kind === "none") { return; }
				output.write(this.convert_sumneko_description(builtin.description, this.view_documentation(builtin.name)));
				switch (custom.kind) {
					case "alias":
						this.add_alias_builtin(output, builtin.name, custom.base);
						break;
					case "class":
						this.add_class_builtin(output, builtin.name, custom.base, custom.operators??true);
						break;
				}
				return;
			}
			const info = this.builtin_type_info(builtin);
			if (!info) { return; }
			output.write(this.convert_sumneko_description(builtin.description, this.view_documentation(builtin.name)));
			let builtinType = info.type;
			switch (builtinType) {
				case "unsigned":
				case "integer":
					builtinType =
						((this.docsettings.useInteger ?? true) === false) ?
							"number" : "integer";
					break;
			}
			switch (this.docsettings.numberStyle) {
				case "aliasNative":
				default:
					const isNative =
						(info.type === "number" && info.size === 64) ||
						(info.type === "integer" && info.size === 32) ;
					if (isNative) {
						this.add_alias_builtin(output, builtin.name, builtinType);
					} else {
						this.add_class_builtin(output, builtin.name, [builtinType]);
					}
					break;
				case "alias":
					this.add_alias_builtin(output, builtin.name, builtinType);
					break;
				case "class":
					this.add_class_builtin(output, builtin.name, [builtinType]);
					break;
			}
		});
	}
	private generate_sumneko_defines(output:Writable) {
		output.write(this.convert_sumneko_description(this.view_documentation("defines")));
		output.write("---@class defines\n");
		output.write("defines={}\n\n");

		const generate = (define:ApiDefine, name_prefix:string)=>{
			const name = `${name_prefix}${define.name}`;
			const doctext = this.convert_sumneko_description(define.description, this.view_documentation(name));
			output.write(doctext);
			//there aren't any with both values and subkeys for now,
			//we'll deal with that if it ever happens...
			if (define.values) {
				output.write(`---@enum ${name}\n`);
				output.write(`${name}={\n`);
				define.values.forEach(value=>{
					output.write(this.convert_sumneko_description(value.description, this.view_documentation(`${name}.${value.name}`)));
					output.write(`${to_lua_ident(value.name)} = #{},\n`);
				});
				output.write(`}\n`);
			} else {
				const adjust = overlay.adjust.define[name];
				let indextag = "";
				if (adjust?.subkeys) {
					indextag = ": " + adjust.subkeys
						.map(s=>({start: `{[${s}]:`, end: `}`}))
						.reduceRight((s, c)=>`${c.start}${s}${c.end}`, "0");
				}
				output.write(`---@class ${name}${indextag}\n`);
				output.write(`${name}={}\n`);
				if (define.subkeys) {
					const child_prefix = `${name}.`;
					define.subkeys.forEach(subkey=>generate(subkey, child_prefix));
				}
			}
		};

		this.docs.defines.forEach(define=>generate(define, "defines."));
	}
	private generate_sumneko_events(output:Writable) {
		this.docs.events.forEach(event=>{
			const view_documentation_link = this.view_documentation(event.name);
			output.write(this.convert_sumneko_description(this.format_entire_description(event, view_documentation_link)));
			output.write(`---@class EventData.${event.name} : EventData\n`);
			event.data.forEach(param=>{
				this.write_sumneko_field(
					output, param.name, param.type,
					()=>[`${event.name}.${param.name}`, view_documentation_link],
					[param.description, view_documentation_link], param.optional);
			});
			output.write("\n");
		});
	}
	private generate_sumneko_LuaObjectNames(output:Writable) {
		const names = this.docs.classes.map(c=>`"${c.name}"`);
		output.write(`---@alias LuaObject.object_name ${names.join("|")}\n`);
	}
	private generate_sumneko_classes(createWriteStream:(filename:string)=>WriteStream) {
		this.docs.classes.forEach(async aclass=>{
			const fs = createWriteStream(`runtime-api-${aclass.name}.lua`);
			this.generate_sumneko_header(fs, aclass.name);
			this.add_sumneko_class(fs, aclass);
			fs.write(`\n`);
			fs.close();
		});
	}

	private write_sumneko_field(
		output:Writable, name:string, type:ApiType,
		get_table_name_and_view_doc_link:()=>[string, string],
		description:string|string[], optional?:boolean, inline_desc?:string) {
		output.write(this.convert_sumneko_description(...(description instanceof Array ? description : [description])));
		output.write(`---@field ${name}${optional ? "?" : ""} ${this.format_sumneko_type(type, get_table_name_and_view_doc_link)} ${inline_desc??""}\n`);
	}

	private add_attribute(output:Writable, classname:string, attribute:ApiAttribute<V>, oper_lua_name?:string, type?:ApiType) {
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


	private add_operator(output:Writable, classname:string, ApiOperator:ApiOperator<V>&{name:"length"}) {
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

	private add_return_annotation(output:Writable, classname:string, method:ApiMethod<V>) {
		method.return_values.forEach((rv)=>{
			output.write(`---@return ${this.convert_param_or_return(rv.type, rv.optional, rv.description, ()=>[
				`${classname}.${method.name}_return`, this.view_documentation(`${classname}.${method.name}`),
			])}`);
		});
	};

	private convert_description_for_method(classname:string, method:ApiMethod<V>, html_name?:string) {
		return this.convert_sumneko_description(
			this.format_entire_description(method, this.view_documentation(`${classname}.${html_name??method.name}`)));
	}

	private add_regular_method(output:Writable, classname:string, method:ApiMethod<V>) {
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

	private add_method_taking_table(output:Writable, classname:string, method:ApiMethod<V>) {
		const param_class_name = `${classname}.${method.name}_param`;
		this.add_table_type(output, method, param_class_name, this.view_documentation(`${classname}.${method.name}`));
		output.write("\n");
		output.write(this.convert_description_for_method(classname, method));
		output.write(`---@param param${method.table_is_optional?"?":" "}${param_class_name}\n`);
		this.add_return_annotation(output, classname, method);
		output.write(`${method.name}=function(param)end${classname!==""?",":""}\n`);
	};

	private add_method(output:Writable, classname:string, method:ApiMethod<V>) {
		return method.takes_table?this.add_method_taking_table(output, classname, method):this.add_regular_method(output, classname, method);
	}

	private add_sumneko_class(output:Writable, aclass:ApiClass<V>):void {

		const needs_label = !!(aclass.description || aclass.notes);
		output.write(this.convert_sumneko_description(this.format_entire_description(
			aclass, this.view_documentation(aclass.name),
			this.globals.get(aclass.name)?.description ?
				`**Global Description:**\n${this.globals.get(aclass.name)?.description}${needs_label?"\n\n**Class Description:**\n":"\n\n"}${aclass.description}` :
				aclass.description
		)));
		if ('category' in aclass) {
			output.write(`---@class ${aclass.name}\n`);
		} else {
			const base_classes = aclass.base_classes ?? ["LuaObject"];
			const generic_params = overlay.adjust.class[aclass.name]?.generic_params;
			const operators = aclass.operators;
			const generic_tag = generic_params? `<${generic_params.join(',')}>`:'';
			const indexed = overlay.adjust.class[aclass.name]?.generic_params ?
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

			const callop = operators.find((op): op is ApiMethod<V>&{name:"call"}=>op.name==="call");
			if (callop) {
				const params = callop.parameters.map((p, i)=>`${p.name??`param${i+1}`}${p.optional?'?':''}:${this.format_sumneko_type(p.type, ()=>[`${aclass.name}()`, ''])}`);
				const returns = ("return_values" in callop) ?
					callop.return_values.map((p, i)=>`${this.format_sumneko_type(p.type, ()=>[`${aclass.name}.__call`, ''])}`):
					undefined;

				output.write(this.convert_description_for_method(aclass.name, callop, "operator%20()"));
				output.write(`---@overload fun(${params})${returns?`:${returns}`:''}\n`);
			}
		}

		aclass.attributes.forEach(a=>this.add_attribute(output, aclass.name, a));

		if (!('category' in aclass)) {
			const operators = aclass.operators;
			const lenop = operators.find((op): op is ApiAttribute<V>&{name:"length"}=>op.name==="length");
			if (lenop) {
				this.add_operator(output, aclass.name, lenop);
			};

			const indexop = operators?.find?.((op):op is ApiAttribute<V>&{name:"index"}=>op.name==="index");
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
	}

	private generate_sumneko_concepts(output:Writable) {
		this.docs.concepts.forEach(concept=>{
			const view_documentation_link = this.view_documentation(concept.name);
			if (typeof concept.type === "string") {
				output.write(this.convert_sumneko_description(this.format_entire_description(concept, view_documentation_link)));
				output.write(`---@alias ${concept.name} ${concept.type}\n\n`);
			} else {
				switch (concept.type.complex_type) {
					case "dictionary":
					{
						// check for dict<union,true> and treat as flags instead...
						const k = concept.type.key;
						const v = concept.type.value;
						if (typeof v === "object" && v.complex_type === "literal" && v.value === true &&
								typeof k === "object" && k.complex_type === "union") {
							output.write(this.convert_sumneko_description(this.format_entire_description(concept, view_documentation_link)));
							output.write(`---@class ${concept.name}\n`);
							k.options.forEach((option, i)=>{
								if (typeof option === "object" && "description" in option && option.description) {
									output.write(this.convert_sumneko_description(`${option.description}\n\n${view_documentation_link}`));
								}
								output.write(`---@field [${this.format_sumneko_type(option, ()=>[`${concept.name}.${i}`, view_documentation_link])}] true|nil\n`);
							});
							output.write("\n");
							break;
						}
						output.write(this.convert_sumneko_description(this.format_entire_description(concept, this.view_documentation(concept.name))));
						output.write(`---@alias ${concept.name} ${this.format_sumneko_type(concept.type, ()=>[`${concept.name}`, view_documentation_link]) }\n\n`);
						break;
					}
					case "union":
					case "array":
						output.write(this.convert_sumneko_description(this.format_entire_description(concept, this.view_documentation(concept.name))));
						output.write(`---@alias ${concept.name} ${this.format_sumneko_type(concept.type, ()=>[`${concept.name}`, view_documentation_link]) }\n\n`);
						break;
					case "table":
					case "tuple":
						this.add_table_type(output, concept.type, concept.name, view_documentation_link);
						break;
					case "struct": //V3
					case "LuaStruct": //V4
						output.write(this.convert_sumneko_description(this.format_entire_description(concept, this.view_documentation(concept.name))));
						output.write(`---@class ${concept.name}\n`);
						(concept.type.attributes as ApiAttribute<V>[]).forEach(a=>this.add_attribute(output, concept.name, a));
						break;

					default:
						throw `Unknown type in concept: ${concept.type.complex_type}`;
				}
			}
		});
	}
	private generate_sumneko_global_functions(output:Writable) {
		this.docs.global_functions.forEach((func)=>{
			this.add_method(output, "", func);
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
			readonly order:number
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
			type_data.variant_parameter_groups.concat(overlay.adjust.table[table_class_name]?.variant_parameter_groups??[]).sort(sort_by_order).forEach(group=>{
				group.parameters.sort(sort_by_order).forEach(parameter=>{
					let custom_description = `${applies_to} **"${group.name}"**: ${parameter.optional?"(optional)":"(required)"}${parameter.description?`\n${parameter.description}`:''}`;

					let custom_parameter = custom_parameter_map.get(parameter.name);
					if (custom_parameter) {
						custom_parameter.description = custom_parameter.description ? `${custom_parameter.description}\n\n${custom_description}` : custom_description;
					} else {
						custom_parameter = {name: parameter.name, type: parameter.type, order: parameter.order, description: custom_description, optional: parameter.optional};
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
				return `[${display_name??link}](${link})`;
			} else if (link.match(/\.html($|#)/)) {
				return `[${display_name??link}](${this.runtime_api_base}${link})`;
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