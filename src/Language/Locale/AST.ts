import type { Node, Literal, Parent } from "../ASTUtil";

export type allNodes = Root|Record|Section|CommentGroup|Comment|RichTextNode|PluralOption|PluralMatch|RichTextOpen|RichTextClose|MacroArgument|Error;

// The whole document
export interface Root extends Parent {
	type:'root'
	children:(Record|Section|CommentGroup|Error)[]
}

// A heading, [value]
export interface Section extends Literal, Parent {
	type:'section'
	value:string
	children:(Record|CommentGroup|Error)[]
}

// An individual line, value=children
export interface Record extends Literal, Parent {
	type:'record'
	value:string
	children:(TextNode|CommentGroup|Error)[]
}

export type TextNode = Text|Escape|Parameter|Plural|Macro;
export type RichTextNode = TextNode|RichText|RichTextOpen|RichTextClose|RichTextFormat;

// Anything not valid
export interface Error extends Literal {
	type:'error'
	value:string
}

export interface CommentGroup extends Parent {
	type:'comment_group'
	children: Comment[]
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
export interface PluralMatch extends Literal {
	type: "plural_match"
	value: "rest"|number|[number, number]
	ends_in?: boolean
}

// PluralMatch(,...)=TextNode...
export interface PluralOption extends Parent {
	type:'plural_option'
	children:(PluralMatch|TextNode|Error)[]
}

export interface MacroArgument extends Literal {
	type: "macro_argument"
	value: string
}

// __name__(children[i]__)*
export interface Macro extends Parent {
	type:"macro"
	name:	"ALT_CONTROL"|
			"ALT_CONTROL_LEFT_CLICK"|
			"ALT_CONTROL_RIGHT_CLICK"|
			"CONTROL"|
			"CONTROL_KEY_CTRL"|
			"CONTROL_KEY_SHIFT"|
			"CONTROL_LEFT_CLICK"|
			"CONTROL_MODIFIER"|
			"CONTROL_MOVE"|
			"CONTROL_RIGHT_CLICK"|
			"CONTROL_STYLE_BEGIN"|
			"CONTROL_STYLE_END"|
			"ENTITY"|
			"FLUID"|
			"ITEM"|
			"PLANET"|
			"REMARK_COLOR_BEGIN"|
			"REMARK_COLOR_END"|
			"TILE"|
			"TECHNOLOGY"|
			"RECIPE"
	children:MacroArgument[]
}

// [name=value]
export interface RichText extends Literal {
	type:"richtext"
	name:	"img"|
			"item"|
			"entity"|
			"technology"|
			"recipe"|
			"item-group"|
			"fluid"|
			"tile"|
			"virtual-signal"|
			"achievement"|
			"gps"|
			"special-item"|
			"armor"|
			"train"|
			"train-stop"|
			"tooltip"|
			"space-location"|
			"planet"|
			"quality"|
			"space-age"|
			"asteroid-chunk"|
			"tip"|
			"shortcut"|
			"space-platform"
	value: string
}

// [name=value]
export interface RichTextOpen extends Literal {
	type:"richtextopen"
	name:"color"|"font"
	value: string
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
export interface RichTextFormat extends Parent, Omit<RichTextOpen, "type">, Omit<RichTextClose, "type"> {
	type:"richtextformat"
	children:(RichTextNode)[]
}

// a record rendered to plain text and re-parsed for RichText
// a separate root from the main document tree, parsed within the rendered plaintext
export interface RichTextRoot extends Parent {
	type:'richtextroot'
	children:(RichTextNode|Error)[]
	//TODO: map text positions back to original tree?
}