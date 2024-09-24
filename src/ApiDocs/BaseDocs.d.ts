type Extends<T, X> = T extends X ? T : never;

type ApiVersions = 4|5|6;

interface BaseDocs<V extends ApiVersions = ApiVersions> {
	readonly application:"factorio"
	readonly application_version:string
	readonly api_version:V
}

interface BaseArrayType<T> {
	readonly complex_type:"array"
	readonly value: T
}

interface BaseTupleType<T> {
	readonly complex_type: "tuple"
	readonly values: T[]
}

interface BaseDictionaryType<T> {
	readonly complex_type:"dictionary"
	readonly key: T
	readonly value: T
}

interface BaseUnionType<T> {
	readonly complex_type: "union"
	readonly options: T[]
}

interface BaseLiteralType {
	readonly complex_type:"literal"
	readonly value:string|number|boolean
	readonly description?: string
}

interface BaseTypeType<T> {
	readonly complex_type:"type"
	readonly value: T
	readonly description: string
}

type DocDescription = string|undefined;
interface DocLink {
	scope:"runtime"|"prototype"
	member:string
	part?:string|undefined
}
type DocDescriptionFormatter = (description:DocDescription, doclink?:DocLink)=>DocDescription|Promise<DocDescription>;

interface DocImage {
	readonly filename: string
	readonly caption?: string
}
