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
	private readonly table_or_array_types:Map<string,ApiType>;

	private readonly defines:Set<string>;

	//TODO: version
	private runtime_api_base:string = "https://lua-api.factorio.com/latest/";

	constructor(readonly docjson:string) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio" || this.docs.stage !== "runtime") {
			throw "Unknown JSON Format";
		}

		if (!(this.docs.api_version===1 || this.docs.api_version===2)) {
			throw `Unsupported JSON Version ${(<ApiDocs>this.docs).api_version}`;
		}

		this.classes = new Map(this.docs.classes.map(c => [c.name,c]));
		this.events = new Map(this.docs.events.map(c => [c.name,c]));
		this.concepts = new Map(this.docs.concepts.map(c => [c.name,c]));
		this.builtins = new Map(this.docs.builtin_types.map(c => [c.name,c]));

		this.table_or_array_types = new Map(
			(<ApiTableOrArrayConcept[]>this.docs.concepts.filter(c=>c.category==="table_or_array")).map(
				ta=>[ta.name,ta.parameters.sort(sort_by_order)[0].type]
			));

		this.globals = new Map(this.docs.global_objects.map(g => [
				this.format_emmylua_type(g.type,()=>{
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

	public generate_ts_docs() {
		const ms = new WritableMemoryStream();
		this.generate_ts_builtin(ms);
		ms.write(`\n`);
		this.generate_ts_defines(ms);
		ms.write(`\n`);
		this.generate_ts_events(ms);
		ms.write(`\n`);
		this.generate_ts_classes(ms);
		ms.write(`\n`);
		this.generate_ts_concepts(ms);
		ms.write(`\n`);
		//this.generate_ts_custom(ms);
		ms.write(`\n`);
		//TODO: globals
		ms.write(`\n`);
		return ms.toBuffer();
	}

	private generate_ts_builtin(output:WritableMemoryStream) {
		this.docs.builtin_types.forEach(builtin=>{
			if (!(["string","boolean","table"].includes(builtin.name))) {
				output.write(this.convert_ts_description(
					extend_string({str:builtin.description, post:"\n\n"}) + this.view_documentation(builtin.name)
					));
				output.write(`type ${builtin.name}=number;\n`);
			}
		});
	}
	private generate_ts_defines(output:WritableMemoryStream) {
		output.write(this.convert_ts_description(this.view_documentation("defines")));
		output.write("declare namespace defines {\n");

		const generate = (define:ApiDefine,name_prefix:string) => {
			output.write(this.convert_ts_description(
				extend_string({str: define.description, post: "\n\n"})+this.view_documentation(`${name_prefix}${define.name}`)
			));
			if (define.values) {
				output.write(`enum ${define.name} {\n`);
				define.values.forEach(value=>{
					output.write(this.convert_ts_description(
						extend_string({str: value.description, post: "\n\n"})+this.view_documentation(`${name_prefix}${define.name}.${value.name}`)
						));
					output.write(`${value.name},\n`);
				});
				output.write("}\n");
			}
			if (define.subkeys) {
				output.write(`namespace ${define.name} {\n`);
				define.subkeys.forEach(d=>generate(d,`${name_prefix}${define.name}.`));
				output.write("}\n");
			}
		};

		this.docs.defines.forEach(d=>generate(d,"defines."));
		output.write("}\n");
	}
	private generate_ts_events(output:WritableMemoryStream) {
		this.docs.events.forEach(event=>{
			const view_documentation_link = this.view_documentation(event.name);
			output.write(this.convert_ts_description(this.format_entire_description(event,view_documentation_link)));
			output.write(`interface ${event.name} {\n`);
			event.data.forEach(param=>{
				output.write(this.convert_ts_description(extend_string({str: param.description, post: "\n\n"}) + view_documentation_link));
				output.write(`${param.name}${param.optional?"?":""}:${this.format_ts_type(param.type,()=>[`${event.name}.${param.name}`, view_documentation_link])}\n`);
			});
			output.write(`}\n`);
		});
	}
	private generate_ts_classes(output:WritableMemoryStream) {
		this.docs.classes.forEach(aclass=>{
			this.add_ts_class(output,aclass);
		});
	}


	private add_ts_class(output:WritableMemoryStream,aclass:ApiClassV1):void;
	private add_ts_class(output:WritableMemoryStream,aclass:ApiStructConcept,is_struct:true):void;
	private add_ts_class(output:WritableMemoryStream,aclass:ApiClassV1|ApiStructConcept,is_struct?:boolean):void {



		const add_attribute = (attribute:ApiAttributeV1,oper_ts_name?:string,oper_html_name?:string)=>{
			const aname = oper_ts_name ?? attribute.name;
			const view_doc_link = this.view_documentation(`${aclass.name}::${oper_html_name ?? aname}`);
			output.write(this.convert_ts_description(this.format_entire_description(
				attribute, view_doc_link, `${!attribute.read?"[writeonly]\n":""}${attribute.description}`
			)));
			output.write(`${!attribute.write?"readonly ":""}${aname}:${this.format_ts_type(attribute.type, ()=>[`${aclass.name}.${aname}`,view_doc_link])};\n`);
		};

		const view_documentation_for_method = (method_name:string)=>this.view_documentation(`${aclass.name}::${method_name}`);

		const convert_description_for_method = (method:ApiMethodV1,html_name?:string)=>
			this.convert_ts_description(
				[
					this.format_entire_description(method,view_documentation_for_method(html_name??method.name)),
					method.return_description&&`@returns ${method.return_description}`
				].filter(s=>!!s).join("\n\n")
				);

		const add_method = (method:ApiMethodV1,oper_ts_name?:string,oper_html_name?:string)=>{
			output.write(convert_description_for_method(method,oper_html_name));
			output.write(`${oper_ts_name??method.name}(\n`);
			if (method.takes_table) {
				output.write(`param${method.table_is_optional?"?":""}:`);
				output.write(this.format_ts_interface(method));
			} else {
				const escape_ts_keyword = (str:string)=>{
					const keywords = ["function"];
					return keywords.includes(str) ? `_${str}` : str;
				};
				const sorted_params = method.parameters.sort(sort_by_order);
				output.write(
					sorted_params.map(parameter=>
						`${this.convert_ts_description(parameter.description)}${escape_ts_keyword(parameter.name)}${parameter.optional?"?":""}:`+
						this.format_ts_type(parameter.type,()=>[
							`${aclass.name}.${method.name}.${parameter.name}`, view_documentation_for_method(method.name)
						])).join(",\n")
				);

				if (method.variadic_type) {
					output.write(`,\n`);
					if (method.variadic_description) {
						output.write(this.convert_ts_description(method.variadic_description));
					}
					output.write(`...vararg:`);
					output.write(this.format_ts_type({complex_type:"array",value:method.variadic_type},()=>[
						`${aclass.name}.${method.name}.vararg`, view_documentation_for_method(method.name)
					]));
				}
			}
			output.write(`\n)${method.return_type?`:${this.format_ts_type(method.return_type, ()=>[`${aclass.name}.${method.name}_return`, view_documentation_for_method(method.name)])}`:""};\n`);
		};

		output.write(this.convert_ts_description(this.format_entire_description(aclass, this.view_documentation(aclass.name))));
		if (is_struct) {
			output.write(`interface ${aclass.name} {\n`);
		} else {
			const base_classes = (<ApiClassV1>aclass).base_classes;
			output.write(`interface ${aclass.name}${base_classes?" extends "+base_classes.join(","):""} {\n`);
			if((<ApiClassV1>aclass).operators.find((operator:ApiOperatorV1)=>!["index","length","call"].includes(operator.name))){
					throw `Unkown operator`;
			}
		}

		aclass.attributes.forEach(a=>add_attribute(a));

		if (!is_struct) {
			((<ApiClassV1>aclass).operators.filter(op=>["index","length"].includes(op.name)) as ApiAttributeV1[]).forEach((operator)=>{
				const ts_name = operator.name === "index" ? "__index" : "__len";
				const html_name = `operator%20${ operator.name === "index" ? "[]" : "#"}`;
				add_attribute(operator,ts_name,html_name);
			});

			(<ApiClassV1>aclass).methods.forEach(m=>add_method(m));

			const callop = (<ApiClassV1>aclass).operators.find(op=>op.name==="call") as ApiMethodV1;
			if (callop){
				add_method(callop, "__call", "operator%20()");
			}
		}
		output.write("}\n");
	}

	private generate_ts_concepts(output:WritableMemoryStream) {
		this.docs.concepts.forEach(concept=>{
			const view_documentation_link = this.view_documentation(concept.name);
			switch (concept.category) {
				case "union":
					{
						const sorted_options = concept.options.sort(sort_by_order);
						const get_table_name_and_view_doc_link = (option:ApiUnionConcept["options"][0]):[string,string]=>{
							return [`${concept.name}.${option.order}`, view_documentation_link];
						};
						output.write(this.convert_ts_description(this.format_entire_description(
							concept, view_documentation_link,
							`${extend_string({str:concept.description, post:"\n\n"})
							}May be specified in one of the following ways:${
								sorted_options.map(option=>`\n- ${
									this.format_emmylua_type(option.type, ()=>get_table_name_and_view_doc_link(option), true)
								}${extend_string({pre:": ",str:option.description})}`)
							}`
						)));
						output.write(`type ${concept.name} = `);
						output.write(sorted_options.map(option=>this.format_ts_type(option.type, ()=>get_table_name_and_view_doc_link(option))).join("|"));
						output.write(";\n");
					}
					break;
				case "concept":
					output.write(this.convert_ts_description(this.format_entire_description(concept,this.view_documentation(concept.name))));
					//TODO: dict of custom defs for these?
					output.write(`type ${concept.name} = object;\n`);
					break;
				case "struct":
					this.add_ts_class(output, concept, true);
					break;
				case "flag":
					output.write(this.convert_ts_description(this.format_entire_description(concept,view_documentation_link)));
					output.write(`interface ${concept.name}{\n`);
					concept.options.forEach(option=>{
						output.write(this.convert_ts_description(
							extend_string({str:option.description, post:"\n\n"})+
							view_documentation_link
							));
						output.write(`"${option.name}"?:boolean\n`);
					});
					output.write(`}\n`);
					break;
				case "table":
				case "filter":
					output.write(this.convert_ts_description(this.format_entire_description(concept,view_documentation_link)));
					output.write(`type ${concept.name} = ${this.format_ts_interface(concept)};\n`);
					break;
				case "table_or_array":
					output.write(this.convert_ts_description(this.format_entire_description(concept,view_documentation_link)));
					output.write(`type ${concept.name} = ${this.format_ts_interface(concept)} | [${
						concept.parameters.sort(sort_by_order).map(p=>this.format_ts_type(p.type,()=>{throw "complex in tuple";}))
					}]\n`);
					break;
				case "enum":
					{
						const sorted_options = concept.options.sort(sort_by_order);
						output.write(this.convert_ts_description(this.format_entire_description(
							concept, this.view_documentation(concept.name),[
								concept.description, "Possible values are:",
								...sorted_options.map(option=>
									`\n- "${option.name}"${extend_string({pre:" - ",str:option.description})}`)
							].filter(s=>!!s).join("")
						)));
						output.write(`type ${concept.name} = ${sorted_options.map(o=>`"${o.name}"`).join("|")};\n`);
					}
					break;
				default:
					throw `Unknown concept category: ${concept}`;
			}
		});
	}

	private format_ts_interface(object:ApiWithParameters,type_property?:string|null):string {
		/**
		 * ({parameters:type}&(format_ts_interface(object.variant_parameter_groups)|))
		 */
		const maintable = `{\n${type_property??""}${object.parameters.map(p=>
				`"${p.name}"${p.optional?"?":""}:${this.format_ts_type(p.type,()=>{throw "nested tables";})}`
			).join(",\n")}\n}`;
		if (!object.variant_parameter_groups) {
			return maintable;
		} else {
			const type_field_matches = object.variant_parameter_description?.match(/depending on `(.+)`:/);
			const type_field = type_field_matches && type_field_matches[1];
			return `(${maintable}&(${
				object.variant_parameter_description?this.convert_ts_description(object.variant_parameter_description):""
			}${
				object.variant_parameter_groups.map(group=>this.format_ts_interface(group,type_field && `${type_field}:"${group.name}"\n`)).join("|")
			}))`;
		}
	}

	public generate_emmylua_docs() {
		const ms = new WritableMemoryStream();
		ms.write(`---@meta\n`);
		ms.write(`---@diagnostic disable\n`);
		ms.write(`\n`);
		ms.write(`--$Factorio ${this.docs.application_version}\n`);
		ms.write(`--$Overlay ${overlay.version}\n`);
		ms.write(`-- This file is automatically generated. Edits will be overwritten.\n`);
		ms.write(`\n`);
		this.generate_emmylua_builtin(ms);
		ms.write(`\n`);
		this.generate_emmylua_defines(ms);
		ms.write(`\n`);
		this.generate_emmylua_events(ms);
		ms.write(`\n`);
		this.generate_emmylua_classes(ms);
		ms.write(`\n`);
		this.generate_emmylua_concepts(ms);
		ms.write(`\n`);
		this.generate_emmylua_custom(ms);
		ms.write(`\n`);
		this.generate_emmylua_table_types(ms);
		ms.write(`\n`);
		return ms.toBuffer();
	}

	private generate_emmylua_builtin(output:WritableMemoryStream) {
		this.docs.builtin_types.forEach(builtin=>{
			if (!(["string","boolean","table"].includes(builtin.name))) {
				output.write(this.convert_emmylua_description(
					extend_string({str:builtin.description, post:"\n\n"}) + this.view_documentation(builtin.name)
					));
				output.write(`---@class ${builtin.name}:number\n\n`);
			}
		});
	}
	private generate_emmylua_defines(output:WritableMemoryStream) {
		output.write(this.convert_emmylua_description(this.view_documentation("defines")));
		output.write("---@class defines\n");
		output.write("defines={}\n\n");

		const generate = (define:ApiDefine,name_prefix:string) => {
			const name = `${name_prefix}${define.name}`;
			output.write(this.convert_emmylua_description(
				extend_string({str: define.description, post: "\n\n"})+this.view_documentation(name)
			));
			output.write(`---@class ${name}\n${name}={\n`);
			const child_prefix = `${name}.`;
			if (define.values) {
				define.values.forEach(value=>{
					output.write(this.convert_emmylua_description(
						extend_string({str: value.description, post: "\n\n"})+this.view_documentation(`${name}.${value.name}`)
						));
					output.write(to_lua_ident(value.name)+"=0,\n");
				});
			}
			output.write("}\n\n");
			if (define.subkeys) {
				define.subkeys.forEach(subkey=>generate(subkey,child_prefix));
			}
		};

		this.docs.defines.forEach(define=>generate(define,"defines."));
	}
	private generate_emmylua_events(output:WritableMemoryStream) {
		this.docs.events.forEach(event=>{
			const view_documentation_link = this.view_documentation(event.name);
			output.write(this.convert_emmylua_description(this.format_entire_description(event,view_documentation_link)));
			output.write(`---@class ${event.name}\n`);
			event.data.forEach(param=>{
				output.write(this.convert_emmylua_description(extend_string({str: param.description, post: "\n\n"}) + view_documentation_link));
				output.write(`---@field ${param.name} ${this.format_emmylua_type(param.type,()=>[`${event.name}.${param.name}`, view_documentation_link])}`);
				output.write(param.optional?"|nil\n":"\n");
			});
			output.write("\n");
		});
	}
	private generate_emmylua_classes(output:WritableMemoryStream) {
		this.docs.classes.forEach(aclass=>this.add_emmylua_class(output,aclass));
		output.write(`\n\n---@alias LuaObject ${this.docs.classes.map(aclass=>aclass.name).join("|")}\n\n`);
	}

	private add_emmylua_class(output:WritableMemoryStream,aclass:ApiClass):void;
	private add_emmylua_class(output:WritableMemoryStream,aclass:ApiStructConcept,is_struct:true):void;
	private add_emmylua_class(output:WritableMemoryStream,aclass:ApiClass|ApiStructConcept,is_struct?:boolean):void {
		const add_attribute = (attribute:ApiAttribute,oper_lua_name?:string,oper_html_name?:string)=>{
			const aname = oper_lua_name ?? attribute.name;
			const view_doc_link = this.view_documentation(`${aclass.name}::${oper_html_name ?? aname}`);
			output.write(this.convert_emmylua_description(this.format_entire_description(
				attribute, view_doc_link, `[${attribute.read?"R":""}${attribute.write?"W":""}]${extend_string({pre:"\n", str:attribute.description})}`
			)));
			output.write(`---@field ${aname} ${this.format_emmylua_type(attribute.type, ()=>[`${aclass.name}.${aname}`,view_doc_link])}\n`);
		};

		const view_documentation_for_method = (method_name:string)=>{
			return this.view_documentation(`${aclass.name}::${method_name}`);
		};

		const convert_param_or_return = (api_type:ApiType|undefined, description:string|undefined, get_table_name_and_view_doc_link:()=>[string,string]):string =>{
			const formatted_type = this.format_emmylua_type(api_type,get_table_name_and_view_doc_link);
			if (!description) {
				return `${formatted_type}\n`;
			} else if (!description.includes("\n")) {
				return `${formatted_type}@${this.preprocess_description(description)}\n`;
			} else {
				return `${formatted_type}@\n${this.convert_emmylua_description(description)}`;
			}
		};

		const add_return_annotation = (method:ApiMethod)=>{
			if ((<ApiMethodV1>method).return_type) {
				const v1m:ApiMethodV1 = method;
				output.write(`---@return ${convert_param_or_return(v1m.return_type,v1m.return_description,()=>[
					`${aclass.name}.${method.name}_return`, view_documentation_for_method(method.name)
				])}`);
			}
			if ((<ApiMethodV2>method).return_values) {
				const v2m = <ApiMethodV2>method;
				v2m.return_values.forEach((rv)=>{
					output.write(`---@return ${convert_param_or_return(rv.type,rv.description,()=>[
						`${aclass.name}.${method.name}_return`, view_documentation_for_method(method.name)
					])}`);
				});
			}
		};

		const convert_description_for_method = (method:ApiMethod,html_name?:string)=>
			this.convert_emmylua_description(this.format_entire_description(method,view_documentation_for_method(html_name??method.name)));

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
				output.write(`---@vararg ${this.format_emmylua_type(method.variadic_type,()=>[`${aclass.name}.${method.name}_vararg`, view_documentation_for_method(method.name)])}\n`);
				if (method.variadic_description) {
					output.write(this.convert_emmylua_description(`\n**vararg**: ${method.variadic_description.includes("\n")?"\n\n":""}${method.variadic_description}`));
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
		output.write(this.convert_emmylua_description(this.format_entire_description(
			aclass, this.view_documentation(aclass.name),
			extend_string({
				pre: "**Global Description:**\n",
				str: this.globals.get(aclass.name)?.description ?? "",
				post: (needs_label?"\n\n**Class Description:**\n":"\n\n")+aclass.description,
				fallback: aclass.description,
			})
		)));
		if (is_struct) {
			output.write(`---@class ${aclass.name}\n`);
		} else {
			const base_classes = (<ApiClass>aclass).base_classes;
			output.write(`---@class ${aclass.name}${base_classes?":"+base_classes.join(","):""}\n`);
			if((<ApiOperator[]>(<ApiClass>aclass).operators).find((operator:ApiOperator)=>!["index","length","call"].includes(operator.name))){
					throw "Unkown operator";
			}
		}

		aclass.attributes.forEach(a=>add_attribute(a));

		if (!is_struct) {
			const operators = <ApiOperator[]>(<ApiClass>aclass).operators;
			(operators.filter(op=>["index","length"].includes(op.name)) as ApiAttribute[]).forEach((operator)=>{
				const lua_name = operator.name === "index" ? "__index" : "__len";
				const html_name = `operator%20${ operator.name === "index" ? "[]" : "#"}`;
				add_attribute(operator,lua_name,html_name);
			});

			output.write(`${this.globals.get(aclass.name)?.name ?? `local ${to_lua_ident(aclass.name)}`}={\n`);
			(<ApiClass>aclass).methods.forEach(add_method);

			const callop = operators.find(op=>op.name==="call") as ApiMethod;
			if (callop){
				add_regular_method(callop, "__call", "operator%20()");
			}
			output.write("}\n\n");
		}
	}

	private generate_emmylua_concepts(output:WritableMemoryStream) {
		this.docs.concepts.forEach(concept=>{
			const view_documentation_link = this.view_documentation(concept.name);
			switch (concept.category) {
				case "union":
					const sorted_options = concept.options.sort(sort_by_order);
					const get_table_name_and_view_doc_link = (option:ApiUnionConcept["options"][0]):[string,string]=>{
						return [`${concept.name}.${option.order}`, view_documentation_link];
					};
					output.write(this.convert_emmylua_description(this.format_entire_description(
						concept, view_documentation_link,
						`${extend_string({str:concept.description, post:"\n\n"})
						}May be specified in one of the following ways:${
							sorted_options.map(option=>`\n- ${
								this.format_emmylua_type(option.type, ()=>get_table_name_and_view_doc_link(option), true)
							}${extend_string({pre:": ",str:option.description})}`)
						}`
					)));
					output.write(`---@class ${concept.name}:`);
					output.write(sorted_options.map(option=>this.format_emmylua_type(option.type, ()=>get_table_name_and_view_doc_link(option))).join(","));
					output.write("\n\n");
					break;
				case "concept":
					output.write(this.convert_emmylua_description(this.format_entire_description(concept,this.view_documentation(concept.name))));
					output.write(`---@class ${concept.name}\n\n`);
					break;
				case "struct":
					this.add_emmylua_class(output, concept, true);
					break;
				case "flag":
					output.write(this.convert_emmylua_description(this.format_entire_description(concept,view_documentation_link)));
					output.write(`---@class ${concept.name}\n`);
					concept.options.forEach(option=>{
						output.write(this.convert_emmylua_description(
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
					output.write(this.convert_emmylua_description(this.format_entire_description(
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
	private generate_emmylua_custom(output:WritableMemoryStream) {
		overlay.custom.forEach(table=>this.add_table_type(output,table,table.name,""));
	}
	private generate_emmylua_table_types(output:WritableMemoryStream) {
		output.write(this.tablebuff.toBuffer());
	}

	private readonly complex_table_type_name_lut = new Set<string>();
	private tablebuff = new WritableMemoryStream();

	private add_table_type(output:WritableMemoryStream, type_data:ApiWithParameters, table_class_name:string, view_documentation_link:string, applies_to:string = "Applies to"): string
	{

		output.write(this.convert_emmylua_description(view_documentation_link));
		output.write(`---@class ${table_class_name}\n`);

		interface parameter_info{
			readonly name:string
			readonly type:ApiType
			description:string
			readonly optional?:boolean
		}
		const custom_parameter_map = new Map<string, parameter_info>();
		const custom_parameters:parameter_info[] = [];

		type_data.parameters.concat(overlay.adjust.table[table_class_name]?.parameters??[]).sort(sort_by_order).forEach((parameter,i)=>{
			const name = parameter.name;
			const custom_parameter = {name:name, type:parameter.type, description:parameter.description, optional:parameter.optional};
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
						custom_parameter = {name:parameter.name, type:parameter.type, description:custom_description, optional:parameter.optional};
						custom_parameter_map.set(parameter.name, custom_parameter);
						custom_parameters.push(custom_parameter);
					}
				});
			});
		}

		custom_parameters.forEach(custom_parameter=>{
			output.write(this.convert_emmylua_description(extend_string({str: custom_parameter.description, post: "\n\n"})+view_documentation_link));
			output.write(`---@field ${custom_parameter.name} ${this.format_emmylua_type(custom_parameter.type, ()=>
				[`${table_class_name}.${custom_parameter.name}`, view_documentation_link])}`);
			output.write((custom_parameter.optional? "|nil\n":"\n"));
		});

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


	private convert_ts_description(description:string):string {
		if (!description) {
			return "";
		}
		return `/**\n * ${this.preprocess_description(description).replace(/\n/g,"\n * ")}\n */\n`;
	}

	private convert_emmylua_description(description:string):string {
		if (!description) {
			return "";
		}
		return `---${this.preprocess_description(description).replace(/\n/g,"\n---")}\n`;
	}


	private format_ts_type(api_type:ApiType|undefined,get_table_name_and_view_doc_link:()=>[string,string], add_doc_links?: boolean):string
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
				return this.format_ts_type(api_type.value, get_table_name_and_view_doc_link)+"[]";
			case "dictionary":
				return `LuaTable<${this.format_ts_type(api_type.key, modify_getter("_key"))},${this.format_ts_type(api_type.value, modify_getter("_value"))}>`;
			case "variant":
				return api_type.options.map((o,i)=> this.format_ts_type(o,modify_getter("."+i))).join("|");
			case "LuaLazyLoadedValue":
				return `${wrap("LuaLazyLoadedValue")}<${this.format_ts_type(api_type.value, get_table_name_and_view_doc_link)}>`;
			case "LuaCustomTable":
				return `${wrap("LuaCustomTable")}<${this.format_ts_type(api_type.key, modify_getter("_key"))},${this.format_ts_type(api_type.value, modify_getter("_value"))}>`;
			case "table":
				return this.format_ts_interface(api_type);
			case "function":
				return `(${api_type.parameters.map((p,i)=>`param${i+1}:${this.format_ts_type(p,modify_getter(`_param${i+1}`))}`).join(",")})=>any`;
		}
	}

	private format_emmylua_type(api_type:ApiType|undefined,get_table_name_and_view_doc_link:()=>[string,string], add_doc_links?: boolean):string
	{
		const wrap = add_doc_links ? (x:string)=>this.resolve_internal_reference(x) : (x:string)=>x;

		const modify_getter = (table_name_appended_str:string) => ():[string,string] => {
			const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();
			return [table_class_name+table_name_appended_str, view_documentation_link];
		};

		if (!api_type) { return "any"; }
		if (typeof api_type === "string") {
			const elem_type = this.table_or_array_types.get(api_type);
			if (elem_type)
			{
				// use format_type just in case it's a complex type or another `table_or_array`
				const value_type = this.format_emmylua_type(elem_type,()=>[api_type+"_elem",this.view_documentation(api_type)]);
				return `${wrap(api_type)}<${wrap("int")},${value_type}>`;
				// this makes sumneko.lua think it's both the `api_type` and
				// `table<int,value_type>` where `value_type` is the type of the first
				// "parameter" (field) for the `table_or_array` concept
				// it's hacks all the way
			}
			return wrap(api_type);
		}

		switch (api_type.complex_type) {
			case "array":
				return this.format_emmylua_type(api_type.value, get_table_name_and_view_doc_link)+"[]";
			case "dictionary":
				return `${wrap("table")}<${this.format_emmylua_type(api_type.key, modify_getter("_key"))},${this.format_emmylua_type(api_type.value, modify_getter("_value"))}>`;
			case "variant":
				return api_type.options.map((o,i)=> this.format_emmylua_type(o,modify_getter("."+i))).join("|");
			case "LuaLazyLoadedValue":
				return `${wrap("LuaLazyLoadedValue")}<${this.format_emmylua_type(api_type.value, get_table_name_and_view_doc_link)},nil>`;
			case "LuaCustomTable":
				return `${wrap("LuaCustomTable")}<${this.format_emmylua_type(api_type.key, modify_getter("_key"))},${this.format_emmylua_type(api_type.value, modify_getter("_value"))}>`;
			case "table":
				const [table_class_name, view_documentation_link] = get_table_name_and_view_doc_link();

				if (this.complex_table_type_name_lut.has(table_class_name)) {return table_class_name;}

				this.complex_table_type_name_lut.add(table_class_name);
				return this.add_table_type(this.tablebuff,api_type, table_class_name, view_documentation_link);
			case "function":
				return `fun(${api_type.parameters.map((p,i)=>`param${i+1}:${this.format_emmylua_type(p,modify_getter(`_param${i+1}`))}`).join(",")})`;
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