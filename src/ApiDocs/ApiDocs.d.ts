interface ApiDocs<V extends ApiVersions = ApiVersions> extends BaseDocs<V> {
	readonly stage:"runtime"

	readonly classes: ApiClass<V>[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: V extends 4 ? ApiBuiltin[] : never
	readonly concepts: ApiConcept[]
	readonly global_objects: ApiGlobalObject[]
	readonly global_functions: ApiMethod[]
}

interface DocBasicMember<V extends ApiVersions = ApiVersions> {
	readonly name: string
	readonly order: number
	readonly description: string
	readonly notes?: V extends 4 ? string[] : never
	readonly lists?: V extends 5|6 ? string[] : never
	readonly examples?: string[]
	readonly images?: V extends 5|6 ? DocImage[] : never
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

type ApiTupleType<V extends ApiVersions = ApiVersions> =
	V extends 4 ? ApiTupleTypeV4 :
	V extends 5|6 ? BaseTupleType<ApiType<V>> :
	never;

interface ApiTupleTypeV4 extends ApiWithParameters {
	readonly complex_type:"tuple"
}

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
	readonly filter?: V extends 5|6 ? string : never
}

interface ApiDefine<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly values?: DocBasicMember<V>[]
	readonly subkeys?: ApiDefine[]
}

interface ApiBuiltin extends DocBasicMember<4> {}

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

	readonly variadic_type?: V extends 4 ? ApiType<V>: never
	readonly variadic_description?: V extends 4 ? string : never
	readonly takes_table: V extends 4 ? boolean : never
	readonly table_is_optional?: V extends 4 ? boolean : never

	readonly variadic_parameter?: V extends 5|6 ? ApiVariadicParameter<V> : never
	readonly format: V extends 5|6 ? ApiMethodFormat : never

	readonly return_values: Omit<ApiParameter, "name">[]
	readonly raises?: ApiEventRaised<V>[]
}

interface ApiAttribute<V extends ApiVersions = ApiVersions> extends DocBasicMember<V> {
	readonly subclasses?: string[]
	readonly type: V extends 4|5 ? ApiType<V> : never
	readonly read: V extends 4|5 ? boolean : never
	readonly write: V extends 4|5 ? boolean : never
	readonly read_type: V extends 6 ? ApiType<V> : never
	readonly write_type: V extends 6 ? ApiType<V> : never
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
	readonly base_classes?: V extends 4 ? string[] : never
	readonly parent?: V extends 5|6 ? string : never
	readonly abstract: boolean
}