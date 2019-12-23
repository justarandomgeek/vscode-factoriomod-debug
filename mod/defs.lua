--dummy definitions to satisfy type annotations

---@class LuaObject
local function LuaObject() end


---@class Breakpoint
---@field id number | nil
---@field verified boolean
---@field source Source | nil
---@field line number | nil
---@field name string | nil
---@field path string | nil
local function Breakpoint() end

---@class SourceBreakpoint
---@field line number | nil
---@field condition string | nil
---@field hitCondition string | nil
---@field logMessage string | nil
local function SourceBreakpoint() end

---@class Source
---@field name string | nil
---@field path string | nil
local function Source() end

---@class StackFrameFormat
---@field parameters boolean | nil
---@field parameterTypes boolean | nil
---@field parameterNames boolean | nil
---@field parameterValues boolean | nil
---@field line boolean | nil
---@field module boolean | nil
---@field includeAll boolean | nil
local function StackFrameFormat() end

---@class StackFrame
---@field id number
---@field name string
---@field source Source | nil
---@field line number
---@field moduleId number | string | nil
---@field presentationHint string "normal" | "label" | "subtle"
local function StackFrame() end

---@class Scope
---@field name string
---@field presentationHint string "arguments" | "locals" | "registers"
---@field variablesReference integer
---@field namedVariables number | nil
---@field indexedVariables number | nil
local function Scope() end

---@class Variable
---@field name string
---@field value string
---@field type string | nil
---@field presentationHint VariablePresentationHint | nil
---@field variablesReference integer
---@field namedVariables number | nil
---@field indexedVariables number | nil
local function Variable() end

---@class VariablePresentationHint
---@field kind string | nil
---@field attributes string[] | nil
---@field visibility string | nil
local function VariablePresentationHint() end