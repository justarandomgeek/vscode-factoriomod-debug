import type { LuaLSType } from "./LuaLS";
import { LuaLSAlias, LuaLSArray, LuaLSClass, LuaLSDict, LuaLSField, LuaLSFile, LuaLSFunction, LuaLSLiteral, LuaLSOverload, LuaLSParam, LuaLSTuple, LuaLSTypeName, LuaLSUnion } from "./LuaLS";

export class ProtoDocGenerator<V extends ProtoVersions = ProtoVersions> {
	private readonly docs:ProtoDocs<V>;

	private readonly concepts:Map<string, ProtoConcept>;
	private readonly simple_structs:Set<string>;
	private readonly prototypes:Map<string, ProtoPrototype>;

	private readonly namespace = "data";

	constructor(
		docjson:string,
		private readonly settingsdump?:any,
		private readonly protosdump?:any
	) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw new Error(`Unknown application: ${this.docs.application}`);
		}

		if (!(this.docs.api_version===6)) {
			throw new Error(`Unsupported Prototype Docs JSON Version ${this.docs.api_version}`);
		}

		if (this.docs.stage !== "prototype") {
			throw new Error(`Wrong stage: ${this.docs.stage}`);
		}

		this.concepts = new Map(this.docs.types.map(c=>[c.name, c]));
		this.simple_structs = new Set();
		for (const [name, concept] of this.concepts) {
			if (typeof concept.type === "object" && concept.type.complex_type === "struct") {
				this.simple_structs.add(name);
			}
		}
		this.prototypes = new Map(this.docs.prototypes.map(c=>[c.name, c]));

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
		if (['prototypes', 'types'].includes(member)) {
			return `/${member}.html${part}`;
		}
		if (['libraries', 'storage', 'migrations', 'data-lifecycle', 'prototype-tree', 'noise-expressions', 'instrument', 'item-weight'].includes(member)) {
			return `/auxiliary/${member}.html${part}`;
		}
		if (this.concepts.has(member)) {
			return `/types/${member}.html${part}`;
		}
		if (this.prototypes.has(member)) {
			return `/prototypes/${member}.html${part}`;
		}
		console.warn(`Invalid Link: prototype:${member}${part}`);
		return undefined;
	}

	public async generate_LuaLS_docs(
		format_description:DocDescriptionFormatter
	):Promise<(LuaLSFile|Promise<LuaLSFile>)[]> {
		return [
			...(await this.generate_LuaLS_concepts(format_description)),
			...(await this.generate_LuaLS_prototypes(format_description)),
			this.generate_LuaLS_data(format_description),
		];
	}

	private async generate_LuaLS_concepts(format_description:DocDescriptionFormatter): Promise<LuaLSFile[]> {
		const files = [];


		for (const [_, concept] of this.concepts) {
			if (concept.name === "LocalisedString" || concept.type === "builtin") {
				continue;
			}
			const file = new LuaLSFile(`prototype-api/concepts/${concept.name}`, this.application_version, this.namespace);
			const simple = this.simple_structs.has(concept.name);
			const suffix = simple?"":".struct";
			if (concept.properties) {
				const lsclass = new LuaLSClass(concept.name+suffix);
				lsclass.exact = true;
				lsclass.description = await format_description(concept.description, { scope: "prototype", member: concept.name });
				if (concept.parent) {
					lsclass.parents = [new LuaLSTypeName(concept.parent)];
				}
				for (const prop of concept.properties) {
					lsclass.add(new LuaLSField(
						prop.name,
						this.lua_proto_type(prop.type),
						await format_description(prop.description, { scope: "prototype", member: concept.name, part: prop.name }),
						prop.optional,
					));
				}

				file.add(lsclass);
			}

			if (!simple) {
				let ptype = concept.type;
				if (concept.name ==="AnyPrototype" && typeof ptype === "object" && ptype.complex_type === "union") {
					const exclude = [ "MapGenPresets", "GuiStyle" ];
					const options = ptype.options.filter(o=>{
						return typeof o === "object" ?
							!(o.complex_type === "type" && typeof o.value === "string" && exclude.includes(o.value)):
							!exclude.includes(o);
					});
					ptype = {
						complex_type: "union",
						options,
					};
				}
				if (this.protosdump) {
					const pmatch = concept.description.match(/^The name of an? \[(.+)\]/);
					if (concept.type === "string" && concept.name.endsWith("ID") && pmatch) {
						// replace generic alias of `string` with ThingName
						ptype = concept.name.replace(/ID$/, "Name");
					}
				}
				file.add(new LuaLSAlias(concept.name, this.lua_proto_type(ptype, concept), concept.description));
			}

			files.push(file);
		}

		return files;
	}

	private generate_LuaLS_data(format_description:DocDescriptionFormatter): LuaLSFile {
		const file = new LuaLSFile("prototype-api/data", this.application_version, this.namespace);
		const data = new LuaLSClass("data");
		data.add(new LuaLSField("raw", new LuaLSTypeName("raw")));
		data.add(new LuaLSField("is_demo", new LuaLSTypeName("boolean")));

		const extend = new LuaLSFunction("extend", [
			new LuaLSParam("otherdata", new LuaLSArray(new LuaLSTypeName("AnyPrototype"))),
		]);
		extend.add(new LuaLSOverload(undefined, [
			new LuaLSParam("self", new LuaLSTypeName("data")),
			new LuaLSParam("otherdata", new LuaLSArray(new LuaLSTypeName("AnyPrototype"))),
		]));

		extend.add(new LuaLSOverload(undefined, [
			new LuaLSParam("otherdata", new LuaLSArray(new LuaLSTypeName("AnyModSettingPrototype"))),
		]));
		extend.add(new LuaLSOverload(undefined, [
			new LuaLSParam("self", new LuaLSTypeName("data")),
			new LuaLSParam("otherdata", new LuaLSArray(new LuaLSTypeName("AnyModSettingPrototype"))),
		]));

		data.add(extend);
		data.global_name = "data";
		file.add(data);
		const dataraw = new LuaLSClass("raw");
		dataraw.exact = true;
		file.add(dataraw);

		for (const [_, prototype] of this.prototypes) {
			if (prototype.typename) {
				dataraw.add(new LuaLSField(new LuaLSLiteral(prototype.typename), new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName(prototype.name) )));
			}
		}

		//TODO: these should really be on a totally separate data.raw but we can't do that
		dataraw.add(new LuaLSField("bool-setting", new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("ModBoolSettingPrototype")), "In Settings Stage"));
		dataraw.add(new LuaLSField("int-setting", new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("ModIntSettingPrototype")), "In Settings Stage"));
		dataraw.add(new LuaLSField("double-setting", new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("ModDoubleSettingPrototype")), "In Settings Stage"));
		dataraw.add(new LuaLSField("string-setting", new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("ModStringSettingPrototype")), "In Settings Stage"));
		dataraw.add(new LuaLSField("color-setting", new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName("ModColorSettingPrototype")), "In Settings Stage"));

		return file;
	}

	public nameFor(type:string) {
		const p = this.docs.prototypes.find(p=>p.typename===type);
		if (p) {
			return new LuaLSTypeName(p.name.replace(/(Prototype)?$/, "Name"));
		}
		throw new Error(`no type for '${type}'`);
	}

	private async generate_LuaLS_prototypes(format_description:DocDescriptionFormatter): Promise<LuaLSFile[]> {
		const files = [];
		for (const [_, prototype] of this.prototypes) {
			const file = new LuaLSFile(`prototype-api/prototypes/${prototype.name}`, this.application_version, this.namespace);
			const lsproto = new LuaLSClass(prototype.name);
			lsproto.exact = true;
			lsproto.description = await format_description(prototype.description, { scope: "prototype", member: prototype.name });
			if (prototype.parent) {
				lsproto.parents = [new LuaLSTypeName(prototype.parent)];
			}
			for (const prop of prototype.properties) {
				lsproto.add(new LuaLSField(
					prop.name,
					this.lua_proto_type(prop.type),
					await format_description(prop.description, { scope: "prototype", member: prototype.name, part: prop.name }),
					prop.optional,
				));
				if (prop.alt_name) {
					lsproto.add(new LuaLSField(
						prop.alt_name,
						this.lua_proto_type(prop.type),
						await format_description(prop.description, { scope: "prototype", member: prototype.name, part: prop.alt_name }),
						prop.optional,
					));
				}
			}
			if (prototype.custom_properties) {
				const prop = prototype.custom_properties;
				lsproto.add(new LuaLSField(
					this.lua_proto_type(prop.key_type),
					this.lua_proto_type(prop.value_type),
					await format_description(prop.description, { scope: "prototype", member: prototype.name, part: "custom_properties" }),
				));
			}
			file.add(lsproto);

			const nname = prototype.name.replace(/(Prototype)?$/, "Name");
			const options = [];
			// for abstract, list of child types
			this.prototypes.forEach(p=>{
				if (p.parent === prototype.name) {
					options.push(new LuaLSTypeName(p.name.replace(/(Prototype)?$/, "Name")));
				}
			});
			// for non-abstract, list of known names and `string`
			if (prototype.typename) {
				if (this.protosdump) {
					for (const key in this.protosdump[prototype.typename]) {
						options.push(new LuaLSLiteral(key));
					}
				}
				options.push(new LuaLSTypeName("string"));
			}
			file.add(new LuaLSAlias(nname, new LuaLSUnion(options)));
			files.push(file);
		}
		return files;
	}

	private lua_proto_type(type:ProtoType, parent?:ProtoConcept):LuaLSType {
		switch (typeof type) {
			case "string":
				if (type === "bool") { return new LuaLSTypeName("boolean"); }
				return new LuaLSTypeName(type);
			case "object":
				switch (type.complex_type) {
					case "struct":
						if (!parent) {
							throw new Error("struct without parent");
						}
						if (this.simple_structs.has(parent.name)) {
							return new LuaLSTypeName(parent.name);
						}
						return new LuaLSTypeName(parent.name+".struct");
					case "array":
						return new LuaLSArray(this.lua_proto_type(type.value, parent));
					case "tuple":
						return new LuaLSTuple(type.values.map(v=>this.lua_proto_type(v, parent)));
					case "dictionary":
						return new LuaLSDict(this.lua_proto_type(type.key, parent), this.lua_proto_type(type.value, parent));
					case "union":
						return new LuaLSUnion(type.options.map(v=>this.lua_proto_type(v, parent)));
					case "literal":
						return new LuaLSLiteral(type.value);
					case "type":
						return this.lua_proto_type(type.value, parent);

					default:
						throw new Error("Invalid Type");
				}
			default:
				throw new Error("Invalid Type");
		}
	}
}