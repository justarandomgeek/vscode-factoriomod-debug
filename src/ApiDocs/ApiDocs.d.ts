interface ApiDocs<V extends ApiVersions = ApiVersions> extends BaseDocs<V> {
	readonly stage:"runtime"

	readonly classes: ApiClass<V>[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly concepts: ApiConcept[]
	readonly global_objects: ApiGlobalObject[]
	readonly global_functions: ApiMethod[]
}

interface DocBasicMember<V extends ApiVersions = ApiVersions> {
	readonly name: string
	readonly order: number
	readonly description: string
	readonly lists?: string[]
	readonly examples?: string[]
	readonly images?: DocImage[]
}

interface ApiWithParameters<V extends ApiVersions = ApiVersions> {
	readonly parameters: ApiParameter<V>[]
	readonly variant_parameter_groups?: ApiParameterGroup<V>[]
	readonly variant_parameter_description?: string
}

interface ApiConcept<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly type: ApiType<V>|{complex_type:"builtin"}
}

interface ApiStructType {
	readonly complex_type: "LuaStruct"
	readonly attributes: ApiAttribute[]
}

type ApiTupleType<V extends ApiVersions = ApiVersions> = BaseTupleType<ApiType<V>>;

interface ApiCustomTableType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:"LuaCustomTable"
	readonly key: ApiType<V>
	readonly value: ApiType<V>
}

interface ApiFunctionType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:"function"
	readonly parameters: ApiType<V>[]
}

interface ApiLazyLoadedType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:"LuaLazyLoadedValue"
	readonly value: ApiType<V>
}

interface ApiTableType extends ApiWithParameters {
	readonly complex_type:"table"
}

type ApiType<V extends ApiVersions = ApiVersions> =
	string |
	BaseTypeType<ApiType<V>> | BaseUnionType<ApiType<V>> | BaseArrayType<ApiType<V>> |
	BaseDictionaryType<ApiType<V>> | BaseLiteralType |
	ApiCustomTableType | ApiFunctionType | ApiLazyLoadedType |
	ApiStructType | ApiTableType | ApiTupleType<V>;

interface ApiParameter<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly type: ApiType<V>
	readonly optional: boolean
}

interface ApiParameterGroup<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly parameters: ApiParameter<V>[]
}

interface ApiEvent<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly data: ApiParameter<V>[]
	readonly filter?: string
}

interface ApiDefine<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly values?: DocBasicMember<V>[]
	readonly subkeys?: ApiDefine[]
}

interface ApiGlobalObject<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly type: string
}

interface ApiMethodFormat {
	readonly takes_table:boolean
	readonly table_optional?:boolean
}

interface ApiVariadicParameter<V extends ApiVersions = ApiVersions> {
	readonly type?: ApiType<V>
	readonly description?: string
}

interface ApiMethod<V extends ApiVersions = ApiVersions> extends DocBasicMember<V>, ApiWithParameters {
	readonly subclasses?: string[]

	readonly variadic_parameter?: ApiVariadicParameter<V>
	readonly format: ApiMethodFormat

	readonly return_values: Omit<ApiParameter, "name">[]
	readonly raises?: ApiEventRaised<V>[]
}

interface ApiAttribute<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly subclasses?: string[]
	readonly read_type?: ApiType<V>
	readonly write_type?: ApiType<V>
	readonly raises?: ApiEventRaised[]
	readonly optional?: boolean
}

type ApiOperator<V extends ApiVersions = ApiVersions> =
	(ApiMethod<V>&{readonly name:"call"})|
	(ApiAttribute<V>&{readonly name:"index"|"length"});

interface ApiEventRaised<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
}

interface ApiClass<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly methods: ApiMethod<V>[]
	readonly attributes: ApiAttribute[]
	readonly operators: ApiOperator<V>[]
	readonly parent?: string
	readonly abstract: boolean
}