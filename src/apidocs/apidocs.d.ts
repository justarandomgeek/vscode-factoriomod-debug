type ApiDocs = ApiDocsV1|ApiDocsV2;
type ApiClass = ApiClassV1|ApiClassV2;
type ApiMethod = ApiMethodV1|ApiMethodV2;
type ApiAttribute = ApiAttributeV1|ApiAttributeV2;
type ApiOperator = ApiOperatorV1|ApiOperatorV2;

interface ApiDocsV1 {
	readonly application:"factorio"
	readonly stage:"runtime"
	readonly application_version:string
	readonly api_version:1

	readonly classes: ApiClassV1[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConcept[]
	readonly global_objects: ApiGlobalObject[]
}

interface ApiDocsV2 {
	readonly application:"factorio"
	readonly stage:"runtime"
	readonly application_version:string
	readonly api_version:2

	readonly classes: ApiClassV2[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConcept[]
	readonly global_objects: ApiGlobalObject[]
}


interface ApiBasicMember {
	readonly name: string
	readonly order: number
	readonly description: string
}

type ApiWithNotes = ApiBasicMember & {
	readonly notes?: string[]
	readonly examples?: string[]

	// only in V1, but not worth splitting all the types to remove
	readonly see_also?: string[]
};

interface ApiWithParameters {
	readonly parameters: ApiParameter[]
	readonly variant_parameter_groups?: ApiParameterGroup[]
	readonly variant_parameter_description?: string
}


interface ApiVariantType {
	readonly complex_type:"variant"
	readonly options: ApiType[]
}

interface ApiArrayType {
	readonly complex_type:"array"
	readonly value: ApiType
}

interface ApiDictionaryType {
	readonly complex_type:"dictionary"
	readonly key: ApiType
	readonly value: ApiType
}

interface ApiCustomTableType {
	readonly complex_type:"LuaCustomTable"
	readonly key: ApiType
	readonly value: ApiType
}

interface ApiFunctionType {
	readonly complex_type:"function"
	readonly parameters: ApiType[]
}

interface ApiLazyLoadedType {
	readonly complex_type:"LuaLazyLoadedValue"
	readonly value: ApiType
}

type ApiTableType = ApiWithParameters & {
	readonly complex_type:"table"
};

type ApiType = string | ApiVariantType | ApiArrayType | ApiDictionaryType | ApiCustomTableType | ApiFunctionType | ApiLazyLoadedType | ApiTableType;

type ApiParameter = ApiBasicMember & {
	readonly type: ApiType
	readonly optional: boolean
};

type ApiParameterGroup = ApiBasicMember & {
	readonly parameters: ApiParameter[]
};

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

type ApiMethodV2 = ApiWithNotes & ApiWithParameters &{
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_values: ApiParameter[]
	readonly raises?: ApiEventRaised[]
};

type ApiAttributeV2 = ApiAttributeV1 & {
	readonly raises?: ApiEventRaised[]
};

type ApiOperatorV2 = (ApiMethodV2&{readonly name:"call"})|(ApiAttributeV2&{readonly name:"index"|"length"});

type ApiClassV2 = ApiWithNotes & {
	readonly methods: ApiMethodV2[]
	readonly attributes: ApiAttributeV2[]
	readonly operators: ApiOperatorV2[]
	readonly base_classes?: string[]
};

type ApiEvent = ApiWithNotes & {
	readonly data: ApiParameter[]
};

type ApiEventRaised = ApiBasicMember & {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
};

type ApiDefine = ApiBasicMember & {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
};

type ApiBuiltin = ApiBasicMember;

type ApiTableConcept = ApiWithNotes & ApiWithParameters & {
	readonly category: "table"
};

type ApiTableOrArrayConcept = ApiWithNotes & {
	readonly category: "table_or_array"
	readonly parameters: ApiParameter[]
};

type ApiEnumConcept = ApiWithNotes & {
	readonly category: "enum"
	readonly options: ApiBasicMember[]
};

type ApiFlagConcept = ApiWithNotes & {
	readonly category: "flag"
	readonly options: ApiBasicMember[]
};

type ApiUnionConcept = ApiWithNotes & {
	readonly category: "union"
	readonly options: {
		readonly type: ApiType
		readonly order: number
		readonly description: string
	}[]
};

type ApiFilterConcept = ApiWithNotes & ApiWithParameters & {
	readonly category: "filter"
};

type ApiStructConcept = ApiWithNotes & {
	readonly category: "struct"
	readonly attributes: ApiAttributeV1[]
};

type ApiConceptConcept = ApiWithNotes & {
	readonly category: "concept"
};

type ApiConcept = ApiTableConcept | ApiTableOrArrayConcept | ApiEnumConcept | ApiFlagConcept | ApiUnionConcept | ApiFilterConcept | ApiStructConcept | ApiConceptConcept;

type ApiGlobalObject = ApiBasicMember & {
	readonly type: string
};