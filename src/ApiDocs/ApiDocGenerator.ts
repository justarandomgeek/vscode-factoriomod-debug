import { overlay } from "./Overlay";
import type { LuaLSType} from "./LuaLS";
import { is_lua_ident, LuaLSAlias, LuaLSArray, LuaLSClass, LuaLSDict, LuaLSEnum, LuaLSEnumField, LuaLSField, LuaLSFile, LuaLSFunction, LuaLSGeneric, LuaLSLiteral, LuaLSOperator, LuaLSOverload, LuaLSParam, LuaLSReturn, LuaLSTuple, LuaLSTypeName, LuaLSUnion, to_lua_ident } from "./LuaLS";
import assert from "assert";
import type { ProtoDocGenerator } from "./ProtoDocsGenerator";

function sort_by_order(a:{order:number}, b:{order:number}) {
	return a.order - b.order;
}

export class ApiDocGenerator<V extends ApiVersions = ApiVersions> {
	private readonly docs:ApiDocs<V>;

	private readonly classes:Map<string, ApiClass<V>>;
	private readonly events:Map<string, ApiEvent<V>>;
	private readonly concepts:Map<string, ApiConcept<V>>;
	private readonly globals:Map<string, ApiGlobalObject<V>>;

	private readonly defines:Set<string>;

	constructor(
		docjson:string,
		private readonly pdocs?:ProtoDocGenerator<V>,
		private readonly settingsdump?:any,
		private readonly protosdump?:any
	) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw new Error(`Unknown application: ${this.docs.application as string}`);
		}

		if (!(this.docs.api_version===6)) {
			throw new Error(`Unsupported Runtime Docs JSON Version ${this.docs.api_version as number}`);
		}

		if (this.docs.stage !== "runtime") {
			throw new Error(`Wrong stage: ${this.docs.stage as string}`);
		}

		this.classes = new Map(this.docs.classes.map(c=>[c.name, c]));
		this.events = new Map(this.docs.events.map(c=>[c.name, c]));
		this.concepts = new Map(this.docs.concepts.map(c=>[c.name, c]));
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

	public isVersion<VV extends ApiVersions>(v:VV): this is ApiDocGenerator<VV>  {
		return (this.api_version as ApiVersions) === (v as ApiVersions);
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

	public resolve_link(member:string, part?:string):string|undefined {
		part = part ? `#${part}` : "";
		if (['classes', 'events', 'concepts', 'defines'].includes(member)) {
			return `/${member}.html${part}`;
		}
		if (['libraries', 'storage', 'mod-structure', 'migrations', 'data-lifecycle', 'prototype-tree', 'noise-expressions', 'instrument', 'item-weight'].includes(member)) {
			return `/auxiliary/${member}.html${part}`;
		}
		if (this.concepts.has(member)) {
			return `/concepts/${member}.html${part}`;
		}
		if (this.classes.has(member)) {
			return `/classes/${member}.html${part}`;
		}
		if (this.events.has(member)) {
			return `/events.html#${member}`;
		}
		if (this.defines.has(member)) {
			return `/defines.html#${member}`;
		}
		const matches = member.match(/defines\.prototypes\[\'(.+)\'\]/);
		if (matches && this.defines.has(`defines.prototypes.${matches[1]}`)) {
			return `/defines.html#defines.prototypes.${matches[1]}`;
		}
		console.warn(`Invalid Link: runtime:${member}${part}`);
		return undefined;
	}

	public async generate_LuaLS_docs(
		format_description:DocDescriptionFormatter
	):Promise<LuaLSFile[]> {
		return [
			... (await this.generate_LuaLS_classes(format_description)),
			await this.generate_LuaLS_concepts(format_description),
			await this.generate_LuaLS_defines(format_description),
			await this.generate_LuaLS_events(format_description),
			this.generate_LuaLS_LuaObjectNames(),
			await this.generate_LuaLS_global_functions(format_description),
			this.generate_LuaLS_settings(format_description),
		];
	}


	private async generate_LuaLS_classes(format_description:DocDescriptionFormatter) {
		const files:LuaLSFile[] = [];
		for (const aclass of this.docs.classes) {
			files.push(await this.generate_LuaLS_class(aclass, format_description));
		}
		return files;
	}

	private async LuaLS_generics(generic_params?:typeof overlay["adjust"]["class"][""]["generic_params"]) {
		if (!generic_params) { return; }
		const res = [];
		for (const g of generic_params) {
			res.push(new LuaLSGeneric(g.name, g.type ? await this.LuaLS_type(g.type): undefined));
		}
		return res;
	}

	private async generate_LuaLS_class(aclass:ApiClass<V>, format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile(`runtime-api/${aclass.name}`, this.docs.application_version);
		const lsclass = new LuaLSClass(aclass.name);

		const global = this.globals.get(aclass.name);
		if (global) {
			lsclass.global_name = global.name;
		}
		lsclass.description = format_description(this.collect_description(aclass, { scope: "runtime", member: aclass.name }));

		lsclass.parents = aclass.parent ? [new LuaLSTypeName(aclass.parent)] :
			overlay.adjust.class[aclass.name]?.no_common_base ? [ new LuaLSTypeName("userdata") ] :
			[ new LuaLSTypeName("LuaObject.base") ];
		lsclass.generic_args = await this.LuaLS_generics(overlay.adjust.class[aclass.name]?.generic_params);
		if (overlay.adjust.class[aclass.name]?.generic_parent) {
			lsclass.parents.push(await this.LuaLS_type(overlay.adjust.class[aclass.name]?.generic_parent));
		}

		for (const attribute of aclass.attributes) {
			const adjust = overlay.adjust.class[aclass.name]?.members?.[attribute.name];
			let type =
				(attribute.name === "object_name") ? new LuaLSLiteral(aclass.name):
				await this.LuaLS_type(adjust?.type ?? attribute.write_type ?? attribute.read_type, {
					file, table_class_name: `${aclass.name}.${attribute.name}`, format_description,
				});

			switch (adjust?.rule) {
				case "mod-data":
				case "style":
				case "map-gen-presets":
				case "proto-names":
				case "setting-names":
					assert(type instanceof LuaLSTypeName);
					assert(type.name === "LuaCustomTable");
					assert(type.generic_args);
					assert(type.generic_args.length === 2);
					const subclass = new LuaLSClass(`${lsclass.name}.${attribute.name}`);
					subclass.parents = [type];
					switch (adjust.rule) {
						case "mod-data":
							if (this.protosdump) {
								for (const name in this.protosdump["mod-data"]) {
									const m = this.protosdump["mod-data"][name];
									const mtype = m.data_type ? [new LuaLSTypeName(m.data_type)] : undefined;
									subclass.add(new LuaLSField(is_lua_ident(name) ? name : new LuaLSLiteral(name), new LuaLSTypeName("LuaModData", mtype)));
								}
							}
							subclass.parents.push(new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("LuaModData")));
							break;
						case "style":
							if (this.protosdump) {
								for (const name in this.protosdump["gui-style"].default) {
									const style = this.protosdump["gui-style"].default[name];
									if (typeof style === "object" && "type" in style) {
										subclass.add(new LuaLSField(is_lua_ident(name) ? name : new LuaLSLiteral(name), new LuaLSLiteral(style.type)));
									}
								}
							}
							subclass.parents.push(new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("string")));
							break;
						case "map-gen-presets":
							if (this.protosdump) {
								for (const name in this.protosdump["map-gen-presets"].default) {
									const preset = this.protosdump["map-gen-presets"].default[name];
									if (typeof preset === "object") {
										subclass.add(new LuaLSField(is_lua_ident(name) ? name : new LuaLSLiteral(name), type.generic_args[1]));
									}
								}
							}
							subclass.parents.push(new LuaLSDict(new LuaLSTypeName("string"), type.generic_args[1]));
							break;
						case "setting-names":
							if (this.settingsdump) {
								//TODO: extract these types an apply as generic to LuaModSettingsPrototype? some properties won't quite work...
								for (const proto of ["bool-setting", "int-setting", "double-setting", "string-setting", "color-setting"]) {
									for (const name in this.settingsdump[proto]) {
										subclass.add(new LuaLSField(is_lua_ident(name) ? name : new LuaLSLiteral(name), type.generic_args[1]));
									}
								}
							}
							subclass.parents.push(new LuaLSDict(new LuaLSTypeName("string"), type.generic_args[1]));
							break;
						case "proto-names":
							const protos = this.docs.defines.find(d=>d.name==="prototypes")!.subkeys!
								.find(d=>d.name===(adjust.protos_from ?? attribute.name))?.values?.map(d=>d.name);

							if (this.protosdump) {
								for (const proto of protos!) {
									for (const name in this.protosdump[proto]) {
										subclass.add(new LuaLSField(is_lua_ident(name) ? name : new LuaLSLiteral(name), type.generic_args[1]));
									}
								}
							}
							subclass.parents.push(new LuaLSDict(new LuaLSTypeName("string"), type.generic_args[1]));
							break;
					}
					file.add(subclass);
					type = new LuaLSTypeName(subclass.name);
					break;
				case "skip":
					continue;
			}

			lsclass.add(new LuaLSField(
				attribute.name,
				type,
				format_description(this.collect_description(attribute, { scope: "runtime", member: aclass.name, part: attribute.name })),
				attribute.optional
			));
		}

		for (const operator of aclass.operators) {
			switch (operator.name) {
				case "call":
				{
					lsclass.add(new LuaLSOverload(
						format_description(this.collect_description(operator,  { scope: "runtime", member: aclass.name, part: "call_operator" })),
						await this.LuaLS_params(operator.parameters, format_description),
						await this.LuaLS_returns(operator.return_values, format_description)
					));
					break;
				}
				case "length":
				{
					const lenop = new LuaLSOperator("len", await this.LuaLS_type(operator.read_type));
					lenop.description = format_description(this.collect_description(operator, { scope: "runtime", member: aclass.name, part: "length_operator" }));
					lsclass.add(lenop);
					break;
				}
				case "index":
				{
					if (overlay.adjust.class[aclass.name]?.no_index) { break; }
					lsclass.add(new LuaLSField(
						await this.LuaLS_type(overlay.adjust.class[aclass.name]?.index_key ?? "uint"),
						await this.LuaLS_type(overlay.adjust.class[aclass.name]?.index_value ?? operator.write_type ?? operator.read_type),
						format_description(this.collect_description(operator, { scope: "runtime", member: aclass.name, part: "index_operator" })),
					));
					break;
				}
				default:
					throw new Error(`Unkown operator: ${(<ApiOperator>operator).name}`);
			}
		}

		let funcclass = lsclass;
		if (overlay.adjust.class[aclass.name]?.split_funcs) {
			funcclass = new LuaLSClass(`${aclass.name}_funcs`);

			file.add(funcclass);
			lsclass.parents.push(new LuaLSTypeName(`${aclass.name}_funcs`));
		}

		for (const method of aclass.methods) {
			const adjust = overlay.adjust.class[aclass.name]?.methods?.[method.name];

			const m:ApiMethod<V> = {
				...method,
				return_values: adjust?.return_values ?? method.return_values,
			};
			const func = await this.LuaLS_function(m, file, format_description, aclass.name);

			if (adjust?.asfield) { func.asfield = true; }

			funcclass.add(func);
		}

		file.add(lsclass);
		return file;
	}

	private async generate_LuaLS_concepts(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/concepts", this.docs.application_version);

		for (const concept of this.docs.concepts) {
			const description = format_description(this.collect_description(concept, { scope: "runtime", member: concept.name }));
			const ctype = concept.type;
			if (this.protosdump) {
				if (concept.name.endsWith("ID")) {
					if (typeof ctype === "object" && ctype.complex_type === "union" &&
						ctype.options.find(t=>{ return t==="string" || (typeof t === "object" && t.complex_type==="type" && t.value==="string"); })) {
						ctype.options.push("data."+concept.name.replace(/ID$/, "Name"));
					}

				}
			}

			if (typeof ctype === "string") {
				file.add(new LuaLSAlias(concept.name, await this.LuaLS_type(ctype), description));
			} else {
				switch (ctype.complex_type) {
					//@ts-expect-error fallthrough
					case "dictionary":
						// check for dict<union,true> and treat as flags instead...
						const k = ctype.key;
						const v = ctype.value;
						if (typeof v === "object" && v.complex_type === "literal" && v.value === true &&
								typeof k === "object" && k.complex_type === "union") {
							const lsclass = new LuaLSClass(concept.name);
							lsclass.exact = true;
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
					case "LuaStruct":
					{
						const inner = await this.LuaLS_type(ctype, {file, table_class_name: concept.name, format_description});
						if (inner instanceof LuaLSTypeName && inner.name === concept.name) {

						} else {
							file.add(new LuaLSAlias(concept.name, inner, description));
						}
						break;
					}
					case "builtin":
						break;

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

		const join_name = (parent:string, name:string)=>{
			if (is_lua_ident(name)) {
				return `${parent}.${name}`;
			} else {
				return `${parent}['${name}']`;
			}
		};

		const generate = async (define:ApiDefine, parent:string, parent_type:string, use_value?:LuaLSLiteral)=>{
			const name = join_name(parent, define.name);
			const type_name = `${parent_type}.${to_lua_ident(define.name)}`;
			const description = format_description(this.collect_description(define, {scope: "runtime", member: name}));

			if (name === "defines.prototypes") {
				// don't bother with masked-type values for these...
				use_value = new LuaLSLiteral(0);
			}

			//there aren't any with both values and subkeys for now,
			//we'll deal with that if it ever happens...
			if (define.values) {
				const values = define.values.map(v=>{
					const field_description = v.description?.replace(/^deprecated,?/i, "@deprecated");
					const field_type = new LuaLSTypeName(`${type_name}.${to_lua_ident(v.name)}`);
					const field = new LuaLSEnumField(v.name, field_type, field_description, use_value);
					return field;
				});
				if (this.protosdump) {
					if (name === "defines.events") {
						const add_event = (key:string)=>{
							// non-ident type names but it seems to work better this way?
							const field_type = new LuaLSTypeName(`${type_name}.${key}`);
							const field = new LuaLSEnumField(key, field_type, undefined, use_value);
							values.push(field);
						};

						for (const key in this.protosdump["custom-event"]) {
							add_event(key);
						}
						for (const key in this.protosdump["custom-input"]) {
							add_event(key);
						}
					}
				}
				file.add(new LuaLSEnum(name, type_name, values, description));
			} else {
				const lsclass = new LuaLSClass(name);
				lsclass.global_name = name;
				lsclass.description = description;
				file.add(lsclass);

				if (define.subkeys) {
					for (const subkey of define.subkeys) {
						await generate(subkey, name, type_name, use_value);
					}
				}
			}
		};

		for (const define of this.docs.defines) {
			await generate(define, "defines", "defines");
		}
		return file;
	}

	private async generate_LuaLS_events(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("runtime-api/events", this.docs.application_version);
		const handlers = new LuaLSClass("event_handler.events");

		const add_event_data_type = async (event:ApiEvent<V>)=>{
			const lsevent = new LuaLSClass(`EventData.${event.name}`);
			lsevent.exact = true;
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
		};

		const add_event = (name:string, type?:LuaLSTypeName)=>{
			const handler = new LuaLSFunction("handler", [new LuaLSParam("event", type ?? new LuaLSTypeName(`EventData.${name}`))]);
			handlers.add(new LuaLSField(new LuaLSTypeName(`defines.events.${name}`), handler, undefined, true));
			handlers.add(new LuaLSField(new LuaLSLiteral(name), handler, undefined, true));
		};

		for (const [_, event] of this.events) {
			await add_event_data_type(event);

			if (event.name === "CustomInputEvent") {
				continue;
			}

			add_event(event.name);
		}


		if (this.protosdump) {
			for (const key in this.protosdump["custom-event"]) {
				add_event(key);
			}

			for (const key in this.protosdump["custom-input"]) {
				add_event(key, new LuaLSTypeName(`EventData.CustomInputEvent`));
			}
		}

		handlers.add(new LuaLSField(new LuaLSTypeName("LuaCustomInputPrototype"), new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData.CustomInputEvent`))])));
		handlers.add(new LuaLSField(new LuaLSTypeName("LuaCustomEventPrototype"), new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData`))])));
		handlers.add(new LuaLSField(new LuaLSTypeName("string"), new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData`))])));
		handlers.add(new LuaLSField(new LuaLSTypeName("defines.events"), new LuaLSFunction("handler", [new LuaLSParam("event", new LuaLSTypeName(`EventData`))])));

		file.add(handlers);
		return file;
	}

	private generate_LuaLS_LuaObjectNames() {
		const file = new LuaLSFile("runtime-api/LuaObjectNames", this.docs.application_version);
		file.add(new LuaLSAlias("LuaObject.object_name", new LuaLSUnion(
			this.docs.classes.filter(c=>!c.abstract).map(c=>new LuaLSLiteral(c.name))
		)));
		file.add(new LuaLSAlias("LuaObject", new LuaLSUnion(
			this.docs.classes.filter(c=>!c.abstract).map(c=>new LuaLSTypeName(c.name))
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


	private generate_LuaLS_settings(format_description:DocDescriptionFormatter) {
		const file = new LuaLSFile("mod-settings/settings", this.docs.application_version);

		const parent = new LuaLSTypeName("LuaCustomTable", [
			new LuaLSTypeName("string"),
			new LuaLSTypeName("ModSetting")]);

		const othersettings = new LuaLSTypeName("ModSetting", [new LuaLSUnion([
			new LuaLSTypeName("int32"),
			new LuaLSTypeName("double"),
			new LuaLSTypeName("boolean"),
			new LuaLSTypeName("string"),
			new LuaLSTypeName("Color"),
		])]);

		const startup = new LuaLSClass("StartupModSettings");
		startup.parents = [parent];
		file.add(startup);

		const global = new LuaLSClass("GlobalModSettings");
		global.parents = [parent];
		file.add(global);

		const player = new LuaLSClass("PlayerModSettings");
		player.parents = [parent];
		file.add(player);


		const targets = {
			"startup": startup,
			"runtime-global": global,
			"runtime-per-user": player,
		};

		const typemap = {
			"bool-setting": new LuaLSTypeName("boolean"),
			"int-setting": new LuaLSTypeName("int32"),
			"double-setting": new LuaLSTypeName("double"),
			"string-setting": new LuaLSTypeName("string"),
			"color-setting": new LuaLSTypeName("Color"),
		};

		if (this.settingsdump) {
			for (const stype in this.settingsdump) {
				const settings = this.settingsdump[stype];
				for (const name in settings) {
					const setting = settings[name];
					const target = targets[setting.setting_type as keyof typeof targets];
					if (target) {
						target.add(new LuaLSField(new LuaLSLiteral(name), new LuaLSTypeName("ModSetting", [typemap[setting.type as keyof typeof typemap]])));
					}
				}
			}
		} else {
			startup.add(new LuaLSField(new LuaLSTypeName("string"), othersettings));
			global.add(new LuaLSField(new LuaLSTypeName("string"), othersettings));
			player.add(new LuaLSField(new LuaLSTypeName("string"), othersettings));
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
		const params = func.format.takes_table ?
			[ new LuaLSParam("param", await this.LuaLS_table_type(func, file, `${in_class??""}${in_class?".":""}${func.name}_param`, format_description), undefined, func.format.table_optional) ]:
			await this.LuaLS_params(func.parameters, format_description);
		if (func.variadic_parameter) { // V6
			params.push(new LuaLSParam(
				"...",
				await this.LuaLS_type(func.variadic_parameter.type),
				format_description(func.variadic_parameter.description)
			));
		}

		const returns = await this.LuaLS_returns(func.return_values, format_description);

		const lsfunc = new LuaLSFunction(func.name, params, returns,
			format_description(this.collect_description(func), {scope: "runtime", member: in_class??"libraries", part: in_class?func.name:"new-functions"})
		);

		if (func.format.takes_table && func.variant_parameter_groups) {
			const ptype = params[0].type;
			assert(ptype instanceof LuaLSTypeName);
			assert(ptype.inner instanceof LuaLSAlias);
			assert(ptype.inner.type instanceof LuaLSUnion);
			ptype.inner.type.members.forEach(m=>{
				if ("name" in m && m.name?.endsWith(".base")) {
					return;
				}
				lsfunc.add(new LuaLSOverload(
					undefined,
					[ new LuaLSParam("param", m)],
					returns
				));
			});
		}

		const adjust = in_class ? overlay.adjust.class[in_class]?.methods?.[func.name] : undefined;

		if (adjust?.rule) {
			switch (adjust.rule) {
				case "on-event": {

					// rename the generated handler arg...
					(((params[1].type as LuaLSUnion).members[0] as LuaLSFunction).params![0] as any).name="event";

					// a few special cases first...
					lsfunc.add(new LuaLSOverload(
						undefined,
						[
							new LuaLSParam("event", new LuaLSTypeName("string")),
							new LuaLSParam("handler", new LuaLSFunction("handler", [
								new LuaLSParam("event", new LuaLSTypeName(`EventData`)),
							])),
						]
					));

					lsfunc.add(new LuaLSOverload(
						undefined,
						[
							new LuaLSParam("event", new LuaLSTypeName("LuaCustomEventPrototype")),
							new LuaLSParam("handler", new LuaLSFunction("handler", [
								new LuaLSParam("event", new LuaLSTypeName(`EventData`)),
							])),
						]
					));

					lsfunc.add(new LuaLSOverload(
						undefined,
						[
							new LuaLSParam("event", new LuaLSTypeName("LuaCustomInputPrototype")),
							new LuaLSParam("handler", new LuaLSFunction("handler", [
								new LuaLSParam("event", new LuaLSTypeName(`EventData.CustomInputEvent`)),
							])),
						]
					));

					const add_event = (name:string, filter?:string, eventdata?:LuaLSTypeName)=>{
						const eventtype = new LuaLSUnion([
							new LuaLSTypeName(`defines.events.${name}`),
							new LuaLSLiteral(name),
						]);
						if (!eventdata) {
							eventdata = new LuaLSTypeName(`EventData.${name}`);
						}
						const params = [
							new LuaLSParam("event", eventtype),
							new LuaLSParam("handler", new LuaLSFunction("handler", [
								new LuaLSParam("event", eventdata),
							])),
						];

						if (filter) {
							params.push(new LuaLSParam("filters", new LuaLSArray(new LuaLSTypeName(filter)), undefined, true));
						}

						lsfunc.add(new LuaLSOverload(undefined, params));
					};

					for (const [_, event] of this.events) {
						if (event.name === "CustomInputEvent") {
							//handled separately
							continue;
						}
						add_event(event.name, event.filter);
					}

					if (this.protosdump) {
						for (const key in this.protosdump["custom-event"]) {
							add_event(key);
						}

						for (const key in this.protosdump["custom-input"]) {
							add_event(key, undefined, new LuaLSTypeName(`EventData.CustomInputEvent`));
						}
					}

					break;
				}
				case "set-event-filter": {
					for (const [_, event] of this.events) {
						if (event.filter) {
							const eventtype = new LuaLSUnion([
								new LuaLSTypeName(`defines.events.${event.name}`),
								new LuaLSLiteral(event.name),
							]);
							const params = [
								new LuaLSParam("event", eventtype),
								new LuaLSParam("filters", new LuaLSArray(new LuaLSTypeName(event.filter)), undefined, true),
							];

							lsfunc.add(new LuaLSOverload(undefined, params));
						}
					}
					break;
				}
			}
		}
		return lsfunc;
	}

	// method table params and table/tuple complex_types
	private async LuaLS_table_type(type_data:ApiWithParameters, file:LuaLSFile,  table_class_name:string, format_description:DocDescriptionFormatter, parents?:LuaLSType[], extrafields?:LuaLSField[]):Promise<LuaLSTypeName> {
		const lsclass = new LuaLSClass(table_class_name);
		lsclass.exact = overlay.adjust.table[table_class_name]?.exact ?? true;
		lsclass.generic_args = await this.LuaLS_generics(overlay.adjust.table[table_class_name]?.generic_params);
		lsclass.parents = parents;
		file.add(lsclass);

		if (extrafields) {
			extrafields.forEach(f=>lsclass.add(f));
		}
		let group_field_name:string|undefined = undefined;
		let group_field_prototypes = false;
		group_field_name = type_data.variant_parameter_description?.match(/depending on `(.+)`/)?.[1];
		if (!group_field_name && this.pdocs && type_data.variant_parameter_description?.match(/depending on the type of entity/)) {
			const p = type_data.parameters.filter(p=>p.name==="name").sort(sort_by_order);
			if (p.length > 0) {
				group_field_name = p[0].name;
				group_field_prototypes = true;
			}
		}
		let group_field = undefined;

		let i = 1;
		for (const param of type_data.parameters.sort(sort_by_order)) {
			const is_tuple = "complex_type" in type_data && type_data.complex_type === "tuple";

			if (param.name === group_field_name) {
				group_field = param;
			}
			lsclass.add(new LuaLSField(
				is_tuple?new LuaLSLiteral(i++):param.name,
				await this.LuaLS_type(overlay.adjust.table[table_class_name]?.parameters?.[param.name]?.type ?? param.type),
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
				const fields = [];
				if (group_field) {
					let group_type;
					if (group_field_prototypes) {
						group_type = this.pdocs!.nameFor(group.name==="particle"?"optimized-particle":group.name);
						if (group_field.type !== "string") {
							group_type = new LuaLSUnion([group_type, new LuaLSTypeName("LuaEntityPrototype"), new LuaLSTypeName("LuaEntity")]);
						}
					} else {
						if (typeof group_field.type === "string" && group_field.type.startsWith("defines.")) {
							group_type = new LuaLSTypeName(group.name);
						} else {
							group_type = new LuaLSLiteral(group.name);
						}
					}
					fields.push(new LuaLSField(group_field.name, group_type));
				}
				const inner = (await this.LuaLS_table_type(group, file, `${table_class_name}.${to_lua_ident(group.name)}`, format_description, [ new LuaLSTypeName(lsclass.name) ], fields));
				inners.push(inner);
			}
			if (!group_field?.optional) {
				inners.push(new LuaLSTypeName(lsclass));
			}
			return new LuaLSTypeName(innerunion);
		}
		return new LuaLSTypeName(lsclass);;
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

			case "tuple":
				return new LuaLSTuple(await Promise.all(api_type.values.map((v, i)=>this.LuaLS_type(v, sub_parent(`${i}`)))));
			case "table":
				if (!in_parent) {
					throw new Error(`${api_type.complex_type} without parent`);
				}
				return this.LuaLS_table_type(api_type, in_parent.file, in_parent.table_class_name, in_parent.format_description);

			case "LuaStruct":
			{
				if (!in_parent) {
					throw new Error(`${api_type.complex_type} without parent`);
				}
				const lsclass = new LuaLSClass(in_parent.table_class_name);
				lsclass.exact = true;
				for (const attribute of api_type.attributes) {
					lsclass.add(new LuaLSField(
						attribute.name,
						await this.LuaLS_type(attribute.write_type ?? attribute.read_type, {
							file: in_parent.file,
							table_class_name: `${in_parent.table_class_name}.${attribute.name}`,
							format_description: in_parent.format_description,
						}),
						in_parent.format_description(this.collect_description(attribute)),
						attribute.optional
					));
				}
				in_parent.file.add(lsclass);
				return new LuaLSTypeName(in_parent.table_class_name);
			}

		}
		throw new Error("Invalid Type");

	}

	private collect_description(obj:Omit<DocBasicMember, "name">&{
		readonly subclasses?:string[]
		readonly raises?: ApiEventRaised[]
	}&({
		readonly read: boolean
		readonly write: boolean
	}|object), doclink?:DocLink, description?:string) {
		if (!description) {
			description = obj.description;
		}
		if ('read' in obj) {
			description = `[${obj.read?"R":""}${obj.write?"W":""}] ${description??""}`;
		}
		return [
			description,
			obj.lists?.join("\n\n"),
			obj.raises && (
				`**Events:**\n${
					obj.raises?.map(raised=>` * ${raised.optional?"May":"Will"} raise [${raised.name}](runtime:events::${raised.name}) ${{instantly: "instantly", current_tick: "later in the current tick", future_tick: "in a future tick"}[raised.timeframe]}.${raised.description?"\n"+raised.description:""}`)?.join("\n\n") }`
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