interface ApiDocs {
	readonly application:"factorio"
	readonly stage:"runtime"
	readonly application_version:string
	readonly api_version:1

	readonly classes: ApiClass[]
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

type ApiMethod = ApiWithNotes & ApiWithParameters &{
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_type?: ApiType
	readonly return_description?: string
};

type ApiAttribute = ApiWithNotes & {
	readonly subclasses?: string[]
	readonly type: ApiType
	readonly read: boolean
	readonly write: boolean
};

type ApiOperator = (ApiMethod&{readonly name:"call"})|(ApiAttribute&{readonly name:"index"|"length"});

type ApiClass = ApiWithNotes & {
	readonly methods: ApiMethod[]
	readonly attributes: ApiAttribute[]
	readonly operators: ApiOperator[]
	readonly base_classes?: string[]
};

type ApiEvent = ApiWithNotes & {
	readonly data: ApiParameter[]
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
	readonly attributes: ApiAttribute[]
};

type ApiConceptConcept = ApiWithNotes & {
	readonly category: "concept"
};

type ApiConcept = ApiTableConcept | ApiTableOrArrayConcept | ApiEnumConcept | ApiFlagConcept | ApiUnionConcept | ApiFilterConcept | ApiStructConcept | ApiConceptConcept;

type ApiGlobalObject = ApiBasicMember & {
	readonly type: string
};