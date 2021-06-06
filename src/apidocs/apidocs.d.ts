interface ApiDocs {
	readonly application:"factorio"
	readonly stage:"runtime"
	readonly application_version:string
	readonly api_version:3

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

interface ApiWithNotes {
	readonly notes?: string[]
	readonly examples?: string[]
	readonly see_also?: string[]
}

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

type ApiMethod = ApiBasicMember & ApiWithNotes & ApiWithParameters &{
	readonly subclasses?: string[]
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_type?: ApiType
	readonly return_description?: string
};

type ApiAttribute = ApiBasicMember & ApiWithNotes & {
	readonly subclasses?: string[]
	readonly type: ApiType
	readonly read: boolean
	readonly write: boolean
};

type ApiOperator = (ApiMethod&{readonly name:"call"})|(ApiAttribute&{readonly name:"index"|"length"});

type ApiClass = ApiBasicMember & ApiWithNotes & {
	readonly methods?: ApiMethod[]
	readonly attributes?: ApiAttribute[]
	readonly operators?: ApiOperator[]
	readonly base_classes?: string[]
};

type ApiEvent = ApiBasicMember & ApiWithNotes & {
	readonly data: ApiParameter[]
};

type ApiDefine = ApiBasicMember & {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
};

type ApiBuiltin = ApiBasicMember;

type ApiTableConcept = ApiBasicMember & ApiWithNotes & ApiWithParameters & {
	readonly category: "table"
};

type ApiUnionConcept = ApiBasicMember & ApiWithNotes & {
	readonly category: "union"
	readonly options: ApiBasicMember[]
};

type ApiFlagConcept = ApiBasicMember & ApiWithNotes & {
	readonly category: "flag"
	readonly options: ApiBasicMember[]
};

type ApiSpecificationConcept = ApiBasicMember & ApiWithNotes & {
	readonly category: "specification"
	readonly options: {
		readonly type: ApiType
		readonly order: number
		readonly description: string
	}[]
};

type ApiFilterConcept = ApiBasicMember & ApiWithNotes & ApiWithParameters & {
	readonly category: "filter"
};

type ApiStructConcept = ApiBasicMember & ApiWithNotes & {
	readonly category: "struct"
	readonly attributes: ApiAttribute[]
};

type ApiConceptConcept = ApiBasicMember & ApiWithNotes & {
	readonly category: "concept"
};

type ApiConcept = ApiTableConcept | ApiUnionConcept | ApiFlagConcept | ApiSpecificationConcept | ApiFilterConcept | ApiStructConcept | ApiConceptConcept;

type ApiGlobalObject = ApiBasicMember & {
	readonly type: string
};