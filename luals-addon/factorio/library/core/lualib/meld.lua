---@meta "meld"

---@namespace meld

---@class meld
---@field private control_marker control_marker
---@field private control_handlers control_handlers
---@overload fun<T>(target:T, source:source<T>):T
local meld = {}

---@class (exact) control_marker empty but unique table used as a marker

---@class control_handlers

---@class (exact) control_op
---@field private marker control_marker

---@class (exact) delete_op : control_op
---@field private op "delete"

---@return delete_op
meld.delete = function() end

---@generic T
---@class (exact) overwrite_op<T> : control_op
---@field private op "overwrite"
---@field private data T

---@generic T
---@param new T
---@return overwrite_op<T>
meld.overwrite = function(new) end

---@generic T
---@class (exact) invoke_op<T> : control_op
---@field private op "invoke"
---@field private fct fun(v:T):T

---@generic T
---@param fct fun(v:T):T
---@return invoke_op<T>
meld.invoke = function(fct) end

---@generic T
---@class (exact) append_op<T> : control_op
---@field private op "append"
---@field private data T

---@generic T
---@param T[]
---@return append_op<T>
meld.append = function(data) end

---@alias source<T> (T extends table and {[K in keyof T]?: source<T[K]>} or T)|delete_op|overwrite_op<T>|invoke_op<T>|(T extends A[] and append_op<A> or never)

--- recursive table merge but it reuses target table (does not deepcopy it). When target is not to be reused or more than
---  2 tables are to be merged, consider using util.merge. When there is conflict of 2 values, a value from the source will
---  win overwriting the existing value. There are also control structures available for extra operations that would not
---  be possible under normal merge rules
---@generic T
---@param target T
---@param source source<T>
---@return T
meld.meld = function(target, source) end

return meld