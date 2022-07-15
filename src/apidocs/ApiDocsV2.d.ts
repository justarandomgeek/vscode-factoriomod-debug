interface ApiDocsV2 {
	readonly application:"factorio"
	readonly application_version:string
	readonly api_version:2
	readonly stage:"runtime"

	readonly classes: ApiClassV2[]
	readonly events: ApiEvent[]
	readonly defines: ApiDefine[]
	readonly builtin_types: ApiBuiltin[]
	readonly concepts: ApiConceptV1[]
	readonly global_objects: ApiGlobalObject[]
}

type ApiEventRaised = ApiBasicMember & {
	readonly timeframe: "instantly"|"current_tick"|"future_tick"
	readonly optional: boolean
};

type ApiMethodV2 = ApiWithNotes & ApiWithParameters &{
	readonly subclasses?: string[]
	readonly variadic_type?: ApiType
	readonly variadic_description?: string
	readonly takes_table: boolean
	readonly table_is_optional?: boolean
	readonly return_values: Omit<ApiParameter,"name">[]
	readonly raises?: ApiEventRaised[]
};

type ApiAttributeV2 = ApiAttributeV1 & {
	readonly raises?: ApiEventRaised[]
};

type ApiOperatorV2 = (ApiMethodV2&{readonly name:"call"})|(ApiAttributeV2&{readonly name:"index"|"length"});

type ApiClassV2 = ApiWithNotes & {
	readonly methods: ApiMethodV2[]
	readonly attributes: ApiAttributeV2[]
	readonly operators: ApiOperatorV2[]
	readonly base_classes?: string[]
};
