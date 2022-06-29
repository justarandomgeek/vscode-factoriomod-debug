
---@class Breakpoint
---@field public id integer | nil
---@field public verified boolean
---@field public source Source | nil
---@field public line integer | nil
---@field public name string | nil
---@field public path string | nil

---@class SourceBreakpoint
---@field public line integer | nil
---@field public condition string | nil
---@field public hitCondition string | nil
---@field public logMessage string | nil
---@field hits integer|nil

---@class Source
---@field public name string | nil
---@field public path string | nil
---@field public sourceReference integer | nil

---@class StackFrame
---@field public id integer
---@field public name string
---@field public source Source | nil
---@field public line integer
---@field public moduleId integer | string | nil
---@field public presentationHint "normal" | "label" | "subtle"

---@class Scope
---@field public name string
---@field public presentationHint "arguments" | "locals" | "registers"
---@field public variablesReference integer
---@field public namedVariables integer | nil
---@field public indexedVariables integer | nil
---@field public expensive boolean

---@class Variable
---@field public name string
---@field public value string
---@field public type string | nil
---@field public presentationHint VariablePresentationHint | nil
---@field public variablesReference integer
---@field public namedVariables integer | nil
---@field public indexedVariables integer | nil

---@class VariablePresentationHint
---@field public kind string | nil
---@field public attributes string[] | nil
---@field public visibility string | nil

---@class Module
---@field public id integer|string
---@field public name string
---@field public version? string
