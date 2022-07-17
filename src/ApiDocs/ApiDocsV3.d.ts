
type ApiConceptV3<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly type: ApiType<V>
};
type ApiTypeType<V extends ApiVersions = ApiVersions> = V extends 1|2 ? never : {
	readonly complex_type:"type"
	readonly value: ApiType<V>
	readonly description: string
};

type ApiStructType<V extends ApiVersions = ApiVersions> = V extends 1|2 ? never : {
	readonly complex_type:"struct"
	readonly attributes: ApiAttribute<V>[]
};

type ApiTupleType<V extends ApiVersions = ApiVersions> = V extends 1|2 ? never : (ApiWithParameters<V> & {
	readonly complex_type:"tuple"
});

type ApiLiteralType<V extends ApiVersions = ApiVersions> = V extends 1|2 ? never : {
	readonly complex_type:"literal"
	readonly value:string|number|boolean
	readonly description?: string
};
