
---@class Breakpoint
---@field public id number | nil
---@field public verified boolean
---@field public source Source | nil
---@field public line number | nil
---@field public name string | nil
---@field public path string | nil

---@class SourceBreakpoint
---@field public line number | nil
---@field public condition string | nil
---@field public hitCondition string | nil
---@field public logMessage string | nil

---@class Source
---@field public name string | nil
---@field public path string | nil

---@class StackFrame
---@field public id number
---@field public name string
---@field public source Source | nil
---@field public line number
---@field public moduleId number | string | nil
---@field public presentationHint string "normal" | "label" | "subtle"

---@class Scope
---@field public name string
---@field public presentationHint string "arguments" | "locals" | "registers"
---@field public variablesReference integer
---@field public namedVariables number | nil
---@field public indexedVariables number | nil
---@field public expensive boolean

---@class Variable
---@field public name string
---@field public value string
---@field public type string | nil
---@field public presentationHint VariablePresentationHint | nil
---@field public variablesReference integer
---@field public namedVariables number | nil
---@field public indexedVariables number | nil

---@class VariablePresentationHint
---@field public kind string | nil
---@field public attributes string[] | nil
---@field public visibility string | nil
