type ApiDocs = ApiDocsV1|ApiDocsV2|ApiDocsV3;
type ApiClass = ApiClassV1|ApiClassV2|ApiClassV3;
type ApiMethod = ApiMethodV1|ApiMethodV2;
type ApiAttribute = ApiAttributeV1|ApiAttributeV2|ApiAttributeV3;
type ApiOperator = ApiOperatorV1|ApiOperatorV2|ApiOperatorV3;
type ApiConcept = ApiConceptV1|ApiConceptV3;

type ReplaceProps<T,New> = Omit<T,keyof New> & New;
type Extends<T,X> = T extends X ? T : never;

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

interface ApiUnionType {
	// "variant" in v1-2, "union" in v3
	readonly complex_type:"variant"|"union"
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

type ApiType = string | ApiTypeType | ApiUnionType | ApiArrayType | ApiDictionaryType | ApiCustomTableType | ApiFunctionType | ApiLiteralType | ApiLazyLoadedType | ApiStructType | ApiTableType | ApiTupleType;

type ApiParameter = ApiBasicMember & {
	readonly type: ApiType
	readonly optional: boolean
};

type ApiParameterGroup = ApiBasicMember & {
	readonly parameters: ApiParameter[]
};

type ApiEvent = ApiWithNotes & {
	readonly data: ApiParameter[]
};

type ApiDefine = ApiBasicMember & {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
};

type ApiBuiltin = ApiBasicMember;

type ApiGlobalObject = ApiBasicMember & {
	readonly type: string
};