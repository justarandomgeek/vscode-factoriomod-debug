type Extends<T, X> = T extends X ? T : never;

type ApiVersions = 3|4;
interface BaseDocs<V extends ApiVersions = ApiVersions> {
	readonly application:"factorio"
	readonly application_version:string
	readonly api_version:V
}

interface BaseArrayType<T> {
	readonly complex_type:"array"
	readonly value: T
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

type DescriptionFormatter = (description?:string)=>string|undefined|Promise<string|undefined>;