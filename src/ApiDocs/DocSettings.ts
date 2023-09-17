export type ApiBuiltinCustom =
	{kind:"none"} |
	{kind:"alias"; base:string} |
	{kind:"class"; base:string[]; operators?:boolean};

export interface DocSettings {
	docLinksVersion?:"latest"|"current"
	signedUMinus?:boolean
	builtinOperators?:boolean
	builtinCustomStyle?:{[k:string]:ApiBuiltinCustom}
	useInteger?:boolean
	numberStyle?:"alias"|"class"|"aliasNative"
}