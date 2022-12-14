import type { Node, Literal, Parent } from "unist";

// The whole document
export interface Root extends Parent {
	type:'root'
	children:(Record|Section|Comment|Error)[]
}

// A heading, [value]
export interface Section extends Literal, Parent {
	type:'section'
	value:string
	children:(Record|Comment|Error)[]
}

// An individual line, value=children
export interface Record extends Literal, Parent {
	type:'record'
	value:string
	children:(RichTextNode|Error)[]
}

export type TextNode = Text|Escape|Parameter|Plural|Macro;
export type RichTextNode = TextNode|RichText|RichTextOpen|RichTextClose|RichTextFormat;

// Anything not valid
export interface Error extends Literal {
	type:'error'
	value:string
}


// [;#] Comment
export interface Comment extends Literal {
	type:'comment'
	value:string
}

// Plain text
export interface Text extends Literal {
	type:'text'
	value:string
}

export interface Escape extends Literal {
	type:'escape'
	value:"\n"
}

// Numbered params __n__
export interface Parameter extends Literal {
	type:'parameter'
	value:number
}

// __plural_for_parameter__n__{children}__
export interface Plural extends Literal, Parent {
	type:'plural'
	value:number
	children: (PluralOption|Error)[]
}

// 5
// 5-15
// ends in 5
// ends in 05-15
// rest
// etc...
export interface PluralMatch extends Literal {
	type: "plural_match"
	value: "rest"|number|[number, number]
	ends_in?: boolean
}

// PluralMatch=TextNode

export interface PluralOption extends Parent {
	type:'plural_option'
	children:(PluralMatch|TextNode|Error)[]
}


// __name__(children[i]__)*
export interface Macro extends Parent {
	type:"macro"
	name:"CONTROL"|"CONTROL_MODIFIER"|"CONTROL_STYLE_BEGIN"|"CONTROL_STYLE_END"|"CONTROL_LEFT_CLICK"|"CONTROL_RIGHT_CLICK"|"CONTROL_KEY_SHIFT"|"CONTROL_KEY_CTRL"|"ALT_CONTROL_LEFT_CLICK"|"ALT_CONTROL_RIGHT_CLICK"|"ALT_CONTROL"|"CONTROL_MOVE"|"ENTITY"|"ITEM"|"TILE"|"FLUID"|"REMARK_COLOR_BEGIN"|"REMARK_COLOR_END"
	children:MacroArgument[]
}

export interface MacroArgument extends Literal {
	type: "macro_argument"
	value: string
}

// [name=value]
export interface RichText extends Literal {
	type:"richtext"
	name:"img"|"item"|"entity"|"technology"|"recipe"|"item-group"|"fluid"|"tile"|"virtual-signal"|"achievement"|"gps"|"special-item"|"armor"|"train"|"train-stop"|"tooltip"
	value:string
}

// [name=value]
export interface RichTextOpen extends Literal {
	type:"richtextopen"
	name:"color"|"font"
	value:string
}
// [/name]
// [.name]
export interface RichTextClose extends Node {
	type:"richtextclose"
	name:"color"|"font"
	close:"/"|"."
}

// [name=value]children[/name]
// [name=value]children[.name]
export interface RichTextFormat extends Literal, Parent {
	type:"richtextformat"
	name:"color"|"font"
	close:"/"|"."
	value:string
	children:TextNode[]
}
