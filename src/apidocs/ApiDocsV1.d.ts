interface ApiDocsV1 {
	readonly application:"factorio"
	readonly application_version:string
	readonly api_version:1
	readonly stage:"runtime"

	readonly classes: ApiClassV1[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConceptV1[]
	readonly global_objects: ApiGlobalObject[]
}

type ApiMethodV1 = ApiWithNotes & ApiWithParameters &{
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_type?: ApiType
	readonly return_description?: string
};

type ApiAttributeV1 = ApiWithNotes & {
	readonly subclasses?: string[]
	readonly type: ApiType
	readonly read: boolean
	readonly write: boolean
};

type ApiOperatorV1 = (ApiMethodV1&{readonly name:"call"})|(ApiAttributeV1&{readonly name:"index"|"length"});

type ApiClassV1 = ApiWithNotes & {
	readonly methods: ApiMethodV1[]
	readonly attributes: ApiAttributeV1[]
	readonly operators: ApiOperatorV1[]
	readonly base_classes?: string[]
};

type ApiTableConceptV1 = ApiWithNotes & ApiWithParameters & {
	readonly category: "table"
};

type ApiTableOrArrayConceptV1 = ApiWithNotes & {
	readonly category: "table_or_array"
	readonly parameters: ApiParameter[]
};

type ApiEnumConceptV1 = ApiWithNotes & {
	readonly category: "enum"
	readonly options: ApiBasicMember[]
};

type ApiFlagConceptV1 = ApiWithNotes & {
	readonly category: "flag"
	readonly options: ApiBasicMember[]
};

type ApiUnionConceptV1 = ApiWithNotes & {
	readonly category: "union"
	readonly options: {
		readonly type: ApiType
		readonly order: number
		readonly description: string
	}[]
};

type ApiFilterConceptV1 = ApiWithNotes & ApiWithParameters & {
	readonly category: "filter"
};

type ApiStructConceptV1 = ApiWithNotes & {
	readonly category: "struct"
	readonly attributes: ApiAttributeV1[]
};

type ApiConceptConceptV1 = ApiWithNotes & {
	readonly category: "concept"
};

type ApiConceptV1 = ApiTableConceptV1 | ApiTableOrArrayConceptV1 | ApiEnumConceptV1 | ApiFlagConceptV1 | ApiUnionConceptV1 | ApiFilterConceptV1 | ApiStructConceptV1 | ApiConceptConceptV1;
