
---@class DebugProtocol.Breakpoint
---@field public id integer | nil
---@field public verified boolean
---@field public source DebugProtocol.Source | nil
---@field public line integer | nil
---@field public name string | nil
---@field public path string | nil

---@class DebugProtocol.SourceBreakpoint
---@field public line integer | nil
---@field public condition string | nil
---@field public hitCondition string | nil
---@field public logMessage string | nil
---@field hits integer|nil

---@class DebugProtocol.Source
---@field public name string | nil
---@field public path string | nil
---@field public sourceReference integer | nil

---@class DebugProtocol.StackFrame
---@field public id integer
---@field public name string
---@field public source? DebugProtocol.Source
---@field public line integer
---@field public column integer
---@field public moduleId? integer | string
---@field public presentationHint? "normal" | "label" | "subtle"

---@class DebugProtocol.Scope
---@field public name string
---@field public presentationHint "arguments" | "locals" | "registers"
---@field public variablesReference integer
---@field public namedVariables integer | nil
---@field public indexedVariables integer | nil
---@field public expensive boolean

---@class DebugProtocol.Variable
---@field public name string
---@field public value string
---@field public type string | nil
---@field public presentationHint DebugProtocol.VariablePresentationHint | nil
---@field public variablesReference integer
---@field public namedVariables integer | nil
---@field public indexedVariables integer | nil

---@class DebugProtocol.VariablePresentationHint
---@field public kind string | nil
---@field public attributes string[] | nil
---@field public visibility string | nil

---@class DebugProtocol.Module
---@field public id integer|string
---@field public name string
---@field public version? string
