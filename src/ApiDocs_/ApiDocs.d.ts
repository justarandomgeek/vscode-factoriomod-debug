type ApiConcept = ApiConceptV1|ApiConceptV3;

type ReplaceProps<T,New> = Omit<T,keyof New> & New;
type Extends<T,X> = T extends X ? T : never;

type ApiVersions = 1|2|3;
interface ApiDocs<V extends ApiVersions = ApiVersions> {
	readonly application:"factorio"
	readonly application_version:string
	readonly api_version:V
	readonly stage:"runtime"

	readonly classes: ApiClass<V>[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: V extends 1|2 ? ApiConceptV1[] : ApiConceptV3[]
	readonly global_objects: ApiGlobalObject[]
	readonly global_function: V extends 1|2 ? never : ApiAttribute<V>
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

interface ApiWithParameters<V extends ApiVersions = ApiVersions> {
	readonly parameters: ApiParameter<V>[]
	readonly variant_parameter_groups?: ApiParameterGroup<V>[]
	readonly variant_parameter_description?: string
}

interface ApiUnionType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:
		V extends 1|2 ? "variant" :
		"union"
	readonly options: ApiType<V>[]
}

interface ApiArrayType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:"array"
	readonly value: ApiType<V>
}

interface ApiDictionaryType<V extends ApiVersions = ApiVersions> {
	readonly complex_type:"dictionary"
	readonly key: ApiType<V>
	readonly value: ApiType<V>
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

type ApiTableType<V extends ApiVersions = ApiVersions> = ApiWithParameters<V> & {
	readonly complex_type:"table"
};

type ApiType<V extends ApiVersions = ApiVersions> = string | ApiTypeType<V> | ApiUnionType<V> | ApiArrayType<V> | ApiDictionaryType<V> | ApiCustomTableType<V> | ApiFunctionType<V> | ApiLiteralType<V> | ApiLazyLoadedType<V> | ApiStructType<V> | ApiTableType<V> | ApiTupleType<V>;

type ApiParameter<V extends ApiVersions = ApiVersions> = ApiBasicMember & {
	readonly type: ApiType<V>
	readonly optional: boolean
};

type ApiParameterGroup<V extends ApiVersions = ApiVersions> = ApiBasicMember & {
	readonly parameters: ApiParameter<V>[]
};

type ApiEvent<V extends ApiVersions = ApiVersions> = ApiWithNotes & {
	readonly data: ApiParameter<V>[]
};

type ApiDefine = ApiBasicMember & {
	readonly values?: ApiBasicMember[]
	readonly subkeys?: ApiDefine[]
};

type ApiBuiltin = ApiBasicMember;

type ApiGlobalObject = ApiBasicMember & {
	readonly type: string
};

type ApiMethod<V extends ApiVersions = ApiVersions> = ApiWithNotes & ApiWithParameters<V> &{
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType<V>
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_type?: V extends 1 ? ApiType<V> : never
	readonly return_description?: V extends 1 ? string : never
	readonly return_values: V extends 1 ? never : Omit<ApiParameter<V>,"name">[]
	readonly raises?: V extends 1 ? never : ApiEventRaised[]
};

type ApiAttribute<V extends ApiVersions = ApiVersions> = ApiWithNotes & {
	readonly subclasses?: string[]
	readonly type: ApiType<V>
	readonly read: boolean
	readonly write: boolean
	readonly raises?:
		V extends 1 ? never :
		ApiEventRaised[]
	readonly optional?:
		V extends 1|2 ? never :
		boolean
};

type ApiOperator<V extends ApiVersions = ApiVersions> = (ApiMethod<V>&{readonly name:"call"})|(ApiAttribute<V>&{readonly name:"index"|"length"});

type ApiEventRaised = ApiBasicMember & {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
};

type ApiClass<V extends ApiVersions = ApiVersions> = ApiWithNotes & {
	readonly methods: ApiMethod<V>[]
	readonly attributes: ApiAttribute<V>[]
	readonly operators: ApiOperator<V>[]
	readonly base_classes?: string[]
	readonly abstract: V extends 1|2 ? never : boolean
};