import { LuaLSAlias, LuaLSArray, LuaLSClass, LuaLSDict, LuaLSField, LuaLSFile, LuaLSLiteral, LuaLSTuple, LuaLSType, LuaLSTypeName, LuaLSUnion } from "./LuaLS";
import type { DocSettings } from "./DocSettings";
import type { WriteStream } from "fs";

export class ProtoDocGenerator<V extends ProtoVersions = ProtoVersions> {
	private readonly docs:ProtoDocs<V>;

	private readonly concepts:Map<string, ProtoConcept>;
	private readonly prototypes:Map<string, ProtoPrototype>;

	private readonly proto_api_base:string;
	private readonly type_prefix = "data.";

	constructor(docjson:string, private readonly docsettings:DocSettings) {
		this.docs = JSON.parse(docjson);

		if (this.docs.application !== "factorio") {
			throw `Unknown application: ${this.docs.application}`;
		}

		if (!(this.docs.api_version===4)) {
			throw `Unsupported JSON Version ${this.docs.api_version}`;
		}

		if (this.docs.stage !== "prototype") {
			throw `Wrong stage: ${this.docs.stage}`;
		}

		switch (docsettings.docLinksVersion) {
			case "latest":
			default:
				this.proto_api_base = "https://lua-api.factorio.com/latest/";
				break;
			case "current":
				this.proto_api_base = `https://lua-api.factorio.com/${this.docs.application_version}/`;
				break;
		}

		this.concepts = new Map(this.docs.types.map(c=>[c.name, c]));
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

	public generate_sumneko_docs(createWriteStream:(filename:string)=>WriteStream) {
		{
			const concepts = this.lua_concepts();
			const file = createWriteStream(concepts.name+".lua");
			concepts.write(file);
			file.close();
		}
		{
			const protos = this.lua_prototypes();
			const file = createWriteStream(protos.name+".lua");
			protos.write(file);
			file.close();
		}
	}

	public lua_concepts(): LuaLSFile {
		const file = new LuaLSFile("prototype-concepts", this.application_version);

		for (const [_, concept] of this.concepts) {
			if (concept.properties) {
				const lsclass = new LuaLSClass(this.type_prefix+concept.name+".struct");
				lsclass.description = concept.description;
				if (concept.parent) {
					lsclass.parent = this.type_prefix+concept.parent+".struct";
				}
				lsclass.fields = [];
				for (const prop of concept.properties) {
					const field = new LuaLSField(prop.name, this.lua_proto_type(prop.type));
					field.description = prop.description;
					lsclass.fields.push(field);
				}

				file.add(lsclass);
			}

			if (concept.type === "builtin") {
				const builtin = this.lua_builtin(concept.name);
				if (builtin) {
					file.add(builtin);
				}
			} else {
				file.add(new LuaLSAlias(this.type_prefix+concept.name, this.lua_proto_type(concept.type, concept)));
			}



		}



		return file;
	}

	public lua_prototypes(): LuaLSFile {
		const file = new LuaLSFile("prototypes", this.application_version);

		const data = new LuaLSClass("data");
		data.fields = [
			new LuaLSField("raw", new LuaLSTypeName("data.raw")),
		];
		data.global_name = "data";
		file.add(data);
		const dataraw = new LuaLSClass("data.raw");
		dataraw.fields = [];
		file.add(dataraw);

		for (const [_, prototype] of this.prototypes) {

			if (prototype.typename) {
				dataraw.fields.push(new LuaLSField(prototype.typename, new LuaLSDict(new LuaLSTypeName("string"), new LuaLSTypeName(this.type_prefix+prototype.name) )));
			}

			const lsproto = new LuaLSClass(this.type_prefix+prototype.name);
			lsproto.description = prototype.description;
			if (prototype.parent) {
				lsproto.parent = this.type_prefix+prototype.parent;
			}
			lsproto.fields = [];
			for (const prop of prototype.properties) {
				const field = new LuaLSField(prop.name, this.lua_proto_type(prop.type));
				field.description = prop.description;
				lsproto.fields.push(field);
			}
			file.add(lsproto);
		}
		return file;
	}

	public lua_proto_type(type:ProtoType, parent?:ProtoConcept):LuaLSType {
		switch (typeof type) {
			case "string":
				switch (type) {
					case "bool":
						return new LuaLSTypeName("boolean");
					case "string":
					case "float":
					case "double":
					case "int8":
					case "uint8":
					case "int16":
					case "uint16":
					case "int32":
					case "uint32":
					case "int64":
					case "uint64":
						return new LuaLSTypeName(type);
				}
				return new LuaLSTypeName(this.type_prefix+type);
			case "object":
				switch (type.complex_type) {
					case "struct":
						if (!parent) {
							throw new Error("struct without parent");
						}
						return new LuaLSTypeName(this.type_prefix+parent.name+".struct");
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

	public lua_builtin(name:string) {
		switch (name) {
			case "bool":
				// just rename it when referenced...
				return undefined;
			case "string":
				// string is just itself
				return undefined;
			case "float":
			case "double":
			case "int8":
			case "uint8":
			case "uint16":
			case "int64":
			case "uint64":
				// various number types already covered by runtime
				return undefined;
			case "int16":
			case "int32":
			case "uint32":
				return new LuaLSAlias(name, new LuaLSTypeName("number"));
			default:
				throw new Error();
		}
	}
}