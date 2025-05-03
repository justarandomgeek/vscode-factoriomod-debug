import type { Parent, Literal } from "../ASTUtil";

export type allNodes = Root|Section|SeparatorLine|VersionLine|DateLine|Category|Entry|EntryExt|Error;

export interface Root extends Parent {
	type:'root'
	children:(Section|Error)[]
}

export interface Section extends Parent {
	type:'section'
	children:(SeparatorLine|VersionLine|DateLine|Category|Error)[]
}

export interface SeparatorLine extends Literal {
	type:'separator'
	value:string
}

export interface VersionLine extends Literal {
	type:'version'
	value: string
	full_line: string
}

export interface DateLine extends Literal {
	type:'date'
	value: string
	full_line: string
}

export interface Category extends Literal, Parent {
	type:'category'
	value:string
	full_line: string
	missing?:boolean
	children:(Entry|Error)[]
}

export interface Entry extends Literal, Parent {
	type:'entry'
	value:string
	rank: number
	full_line: string
	children:(Entry|EntryExt)[]
}

export interface EntryExt extends Literal {
	type:'entryext'
	value:string
	rank: number
	full_line: string
}

export interface Error extends Literal {
	type:'error'
	value:string
}