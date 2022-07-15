type ApiTableConceptV1 = ApiWithNotes & ApiWithParameters & {
	readonly category: "table"
};

type ApiTableOrArrayConceptV1 = ApiWithNotes & {
	readonly category: "table_or_array"
	readonly parameters: ApiParameter[]
};

type ApiEnumConceptV1 = ApiWithNotes & {
	readonly category: "enum"
	readonly options: ApiBasicMember[]
};

type ApiFlagConceptV1 = ApiWithNotes & {
	readonly category: "flag"
	readonly options: ApiBasicMember[]
};

type ApiUnionConceptV1 = ApiWithNotes & {
	readonly category: "union"
	readonly options: {
		readonly type: ApiType
		readonly order: number
		readonly description: string
	}[]
};

type ApiFilterConceptV1 = ApiWithNotes & ApiWithParameters & {
	readonly category: "filter"
};

type ApiStructConceptV1 = ApiWithNotes & {
	readonly category: "struct"
	readonly attributes: ApiAttribute<1>[]
};

type ApiConceptConceptV1 = ApiWithNotes & {
	readonly category: "concept"
};

type ApiConceptV1 = ApiTableConceptV1 | ApiTableOrArrayConceptV1 | ApiEnumConceptV1 | ApiFlagConceptV1 | ApiUnionConceptV1 | ApiFilterConceptV1 | ApiStructConceptV1 | ApiConceptConceptV1;
