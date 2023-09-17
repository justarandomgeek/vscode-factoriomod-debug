type ProtoVersions = 4;

interface ProtoDocs<V extends ProtoVersions = ProtoVersions> extends BaseDocs<V> {
	readonly stage:"prototype"

	readonly prototypes:ProtoPrototype[]
	readonly types:ProtoConcept[]
}

interface ProtoBasicMember extends ApiBasicMember {
	readonly lists?: string[]
	readonly examples?: string[]
	readonly images?: ProtoImage[]

}

interface ProtoPrototype extends ProtoBasicMember {
	readonly parent?: string
	readonly abstract: boolean
	readonly typename?: string
	readonly instance_limit?: number
	readonly deprecated: boolean
	readonly properties: ProtoProperty[]
	readonly custom_properties: ProtoCustomProperty[]
}

interface ProtoConcept extends ProtoBasicMember {
	readonly parent?: string
	readonly abstract: boolean
	readonly inline: boolean
	readonly type: "builtin"|ProtoType
	readonly properties?: ProtoProperty[]
}

interface ProtoProperty extends ProtoBasicMember {
	readonly alt_name?: string
	readonly override: boolean
	readonly type: ProtoType
	readonly optional: boolean
	readonly default: string|BaseLiteralType
}

interface ProtoTupleType {
	readonly complex_type: "tuple"
	readonly values: ProtoType[]
}

interface ProtoStructType {
	readonly complex_type: "struct"
}

type ProtoType =
	string |
	BaseArrayType<ProtoType> | BaseDictionaryType<ProtoType> | BaseUnionType<ProtoType> |
	BaseLiteralType | BaseTypeType<ProtoType> |
	ProtoTupleType | ProtoStructType ;

interface ProtoImage {
	readonly filename: string
	readonly caption?: string
}

interface ProtoCustomProperty {
	readonly description: string
	readonly lists?: string[]
	readonly examples?: string[]
	readonly images?: ProtoImage[]
	readonly key_type: ProtoType
	readonly value_type: ProtoType
}

