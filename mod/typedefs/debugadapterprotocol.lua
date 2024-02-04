
---@class DebugProtocol.Breakpoint
---@field public id? integer
---@field public verified boolean
---@field public source? DebugProtocol.Source
---@field public line? integer
---@field public name? string
---@field public path? string

---@class DebugProtocol.SourceBreakpoint
---@field public line? integer
---@field public condition? string
---@field public hitCondition? string
---@field public logMessage? string
---@field hits? integer

---@class DebugProtocol.Source
---@field public name? string
---@field public path? string
---@field public sourceReference? integer

---@class DebugProtocol.Thread
---@field public id number Unique identifier for the thread.
---@field public name string The name of the thread.

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
---@field public presentationHint? "arguments" | "locals" | "registers"
---@field public variablesReference? integer
---@field public namedVariables? integer
---@field public indexedVariables? integer
---@field public expensive? boolean

---@class DebugProtocol.Variable
---@field public name string
---@field public value string
---@field public type? string
---@field public presentationHint? DebugProtocol.VariablePresentationHint
---@field public variablesReference integer
---@field public namedVariables? integer
---@field public indexedVariables? integer

---@class DebugProtocol.VariablePresentationHint
---@field public kind? string
---@field public attributes? string[]
---@field public visibility? string
---@field public lazy? boolean

---@class DebugProtocol.Module
---@field public id integer|string
---@field public name string
---@field public version? string

---@class DebugProtocol.EvaluateResponseBody
---@field public result string
---@field public type? string
---@field public presentationHint? DebugProtocol.VariablePresentationHint
---@field public variablesReference integer
---@field public namedVariables? integer
---@field public indexedVariables? integer
---@field public memoryReference? string