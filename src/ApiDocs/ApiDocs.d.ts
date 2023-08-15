interface ApiDocs<V extends ApiVersions = ApiVersions> extends BaseDocs<V> {
	readonly stage:"runtime"

	readonly classes: ApiClass<V>[]
	readonly events: ApiEvent<V>[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConcept<V>[]
	readonly global_objects: ApiGlobalObject[]
	readonly global_functions: ApiMethod<V>[]
}

interface ApiBasicMember {
	readonly name: string
	readonly order: number
	readonly description: string
}

interface ApiWithNotes extends ApiBasicMember {
	readonly notes?: string[]
	readonly examples?: string[]
}

interface ApiWithParameters<V extends ApiVersions = ApiVersions> {
	readonly parameters: ApiParameter<V>[]
	readonly variant_parameter_groups?: ApiParameterGroup<V>[]
	readonly variant_parameter_description?: string
}

interface ApiConcept<V extends ApiVersions> extends ApiWithNotes {
	readonly type: ApiType<V>
}

type ApiStructType<V extends ApiVersions = ApiVersions> = V extends 1|2 ? never : {
	readonly complex_type:
		V extends 3 ? "struct" :
		"LuaStruct"
	readonly attributes: ApiAttribute<V>[]
};

interface ApiTupleType<V extends ApiVersions = ApiVersions> extends ApiWithParameters<V> {
	readonly complex_type:"tuple"
}

interface ApiCustomTableType<V extends ApiVersions> {
	readonly complex_type:"LuaCustomTable"
	readonly key: ApiType<V>
	readonly value: ApiType<V>
}

interface ApiFunctionType<V extends ApiVersions> {
	readonly complex_type:"function"
	readonly parameters: ApiType<V>[]
}

interface ApiLazyLoadedType<V extends ApiVersions> {
	readonly complex_type:"LuaLazyLoadedValue"
	readonly value: ApiType<V>
}

interface ApiTableType<V extends ApiVersions> extends ApiWithParameters<V> {
	readonly complex_type:"table"
}

type ApiType<V extends ApiVersions = ApiVersions> = string | BaseTypeType<ApiType<V>> | BaseUnionType<ApiType<V>> | BaseArrayType<ApiType<V>> | BaseDictionaryType<ApiType<V>> | ApiCustomTableType<V> | ApiFunctionType<V> | BaseLiteralType | ApiLazyLoadedType<V> | ApiStructType<V> | ApiTableType<V> | ApiTupleType<V>;

interface ApiParameter<V extends ApiVersions> extends ApiBasicMember {
	readonly type: ApiType<V>
	readonly optional: boolean
}

interface ApiParameterGroup<V extends ApiVersions> extends ApiBasicMember {
	readonly parameters: ApiParameter<V>[]
}

interface ApiEvent<V extends ApiVersions> extends ApiWithNotes {
	readonly data: ApiParameter<V>[]
}

interface ApiDefine extends ApiBasicMember {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
}

interface ApiBuiltin extends ApiBasicMember {}

interface ApiGlobalObject extends ApiBasicMember {
	readonly type: string
}

interface ApiMethod<V extends ApiVersions> extends ApiWithNotes, ApiWithParameters<V> {
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType<V>
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_values: Omit<ApiParameter<V>, "name">[]
	readonly raises?: ApiEventRaised[]
}

interface ApiAttribute<V extends ApiVersions> extends ApiWithNotes {
	readonly subclasses?: string[]
	readonly type: ApiType<V>
	readonly read: boolean
	readonly write: boolean
	readonly raises?: ApiEventRaised[]
	readonly optional?: boolean
}

type ApiOperator<V extends ApiVersions> = (ApiMethod<V>&{readonly name:"call"})|(ApiAttribute<V>&{readonly name:"index"|"length"});

interface ApiEventRaised extends ApiBasicMember {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
}

interface ApiClass<V extends ApiVersions> extends ApiWithNotes {
	readonly methods: ApiMethod<V>[]
	readonly attributes: ApiAttribute<V>[]
	readonly operators: ApiOperator<V>[]
	readonly base_classes?: string[]
	readonly abstract: boolean
}