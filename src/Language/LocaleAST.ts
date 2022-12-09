import type { Literal, Parent } from "unist";

// The whole document
export interface Root extends Parent {
	type:'root'
	children:(Record|Section|Error)[]
}

// A heading, [value]
export interface Section extends Literal, Parent {
	type:'section'
	value:string
	children:(Record|Error)[]
}

// An individual line, value=children
export interface Record extends Literal, Parent {
	type:'record'
	value:string
	children:(TextItem|Error)[]
}

type TextItem = Text|Parameter|Plural|Macro|RichText|RichTextOpen|RichTextClose|RichTextFormat;

// Anything not valid
export interface Error extends Literal {
	type:'error'
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
	children: PluralOption[]
}

// value=children
export interface PluralOption extends Literal, Parent {
	type:'plural_option'
	value:string
	children:TextItem[]
}
// __name__value__
// __name__value[0]__value[1]__
export interface Macro extends Literal {
	type:"macro"
	name:"CONTROL"|"CONTROL_MODIFIER"|"CONTROL_STYLE_BEGIN"|"CONTROL_STYLE_END"|"CONTROL_LEFT_CLICK"|"CONTROL_RIGHT_CLICK"|"CONTROL_KEY_SHIFT"|"CONTROL_KEY_CTRL"|"ALT_CONTROL_LEFT_CLICK"|"ALT_CONTROL_RIGHT_CLICK"|"ALT_CONTROL"|"CONTROL_MOVE"|"ENTITY"|"ITEM"|"TILE"|"FLUID"|"REMARK_COLOR_BEGIN"|"REMARK_COLOR_END"
	value: string|[string, 1|2]
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
export interface RichTextClose extends Literal {
	type:"richtextclose"
	name:"color"|"font"
}

// [name=value]children[/name]
// [name=value]children[.name]
export interface RichTextFormat extends Literal, Parent {
	type:"richtextformat"
	name:"color"|"font"
	value:string
	children:TextItem[]
}


/*
records parse from left to right.
find __
check for named macro/plural tag, or number (no leading 0)




*/



