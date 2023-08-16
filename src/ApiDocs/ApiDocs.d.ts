interface ApiDocs<V extends ApiVersions = ApiVersions> extends BaseDocs<V> {
	readonly stage:"runtime"

	readonly classes: ApiClass[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConcept[]
	readonly global_objects: ApiGlobalObject[]
	readonly global_functions: ApiMethod[]
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

interface ApiWithParameters {
	readonly parameters: ApiParameter[]
	readonly variant_parameter_groups?: ApiParameterGroup[]
	readonly variant_parameter_description?: string
}

interface ApiConcept extends ApiWithNotes {
	readonly type: ApiType
}

interface ApiStructType {
	readonly complex_type:
		"struct" | //V3
		"LuaStruct" //V4
	readonly attributes: ApiAttribute[]
}

interface ApiTupleType extends ApiWithParameters {
	readonly complex_type:"tuple"
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

interface ApiTableType extends ApiWithParameters {
	readonly complex_type:"table"
}

type ApiType =
	string |
	BaseTypeType<ApiType> | BaseUnionType<ApiType> | BaseArrayType<ApiType> |
	BaseDictionaryType<ApiType> | BaseLiteralType |
	ApiCustomTableType | ApiFunctionType | ApiLazyLoadedType |
	ApiStructType | ApiTableType | ApiTupleType;

interface ApiParameter extends ApiBasicMember {
	readonly type: ApiType
	readonly optional: boolean
}

interface ApiParameterGroup extends ApiBasicMember {
	readonly parameters: ApiParameter[]
}

interface ApiEvent extends ApiWithNotes {
	readonly data: ApiParameter[]
}

interface ApiDefine extends ApiBasicMember {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
}

interface ApiBuiltin extends ApiBasicMember {}

interface ApiGlobalObject extends ApiBasicMember {
	readonly type: string
}

interface ApiMethod extends ApiWithNotes, ApiWithParameters {
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_values: Omit<ApiParameter, "name">[]
	readonly raises?: ApiEventRaised[]
}

interface ApiAttribute extends ApiWithNotes {
	readonly subclasses?: string[]
	readonly type: ApiType
	readonly read: boolean
	readonly write: boolean
	readonly raises?: ApiEventRaised[]
	readonly optional?: boolean
}

type ApiOperator =
	(ApiMethod&{readonly name:"call"})|
	(ApiAttribute&{readonly name:"index"|"length"});

interface ApiEventRaised extends ApiBasicMember {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
}

interface ApiClass extends ApiWithNotes {
	readonly methods: ApiMethod[]
	readonly attributes: ApiAttribute[]
	readonly operators: ApiOperator[]
	readonly base_classes?: string[]
	readonly abstract: boolean
}