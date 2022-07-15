
type ApiDocsV3 = ReplaceProps<ApiDocsV2, {
	readonly api_version:3
	readonly classes: ApiClassV3[]
	readonly concepts: ApiConceptV3[]
	readonly global_function: ApiAttributeV3
}>;

type ApiConceptV3 = ApiWithNotes & {
	readonly type: ApiType
};

type ApiAttributeV3 = ApiAttributeV2 & {
	readonly optional: boolean
};

type ApiOperatorV3 = (ApiMethodV2&{readonly name:"call"})|(ApiAttributeV3&{readonly name:"index"|"length"});

type ApiClassV3 = ReplaceProps<ApiClassV2, {
	readonly attributes: ApiAttributeV3[]
	readonly operators: ApiOperatorV3[]
	readonly abstract: boolean
}>;

interface ApiTypeType {
	readonly complex_type:"type"
	readonly value: ApiType
	readonly description: string
}

interface ApiStructType {
	readonly complex_type:"struct"
	readonly attributes: ApiAttributeV3[]
}

type ApiTupleType = ApiWithParameters & {
	readonly complex_type:"tuple"
};

interface ApiLiteralType {
	readonly complex_type:"literal"
	readonly value:string|number|boolean
	readonly description?: string
}
