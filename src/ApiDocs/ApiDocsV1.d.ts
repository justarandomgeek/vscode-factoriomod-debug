type ApiTableConceptV1<V extends ApiVersions> =
	ApiWithNotes<V> & ApiWithParameters<V> & {
	readonly category: "table"
};

type ApiTableOrArrayConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "table_or_array"
	readonly parameters: ApiParameter<V>[]
};

type ApiEnumConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "enum"
	readonly options: ApiBasicMember[]
};

type ApiFlagConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "flag"
	readonly options: ApiBasicMember[]
};

type ApiUnionConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "union"
	readonly options: {
		readonly type: ApiType<V>
		readonly order: number
		readonly description: string
	}[]
};

type ApiFilterConceptV1<V extends ApiVersions> = ApiWithNotes<V> & ApiWithParameters<V> & {
	readonly category: "filter"
};

type ApiStructConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "struct"
	readonly attributes: ApiAttribute<V>[]
};

type ApiConceptConceptV1<V extends ApiVersions> = ApiWithNotes<V> & {
	readonly category: "concept"
};

type ApiConceptV1<V extends ApiVersions> = ApiTableConceptV1<V> | ApiTableOrArrayConceptV1<V> | ApiEnumConceptV1<V> | ApiFlagConceptV1<V> | ApiUnionConceptV1<V> | ApiFilterConceptV1<V> | ApiStructConceptV1<V> | ApiConceptConceptV1<V>;
