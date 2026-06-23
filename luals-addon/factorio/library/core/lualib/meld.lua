---@meta "meld"

---@class meld
---@field private control_marker meld.control_marker
---@field private control_handlers meld.control_handlers
---@overload fun<T>(target:T, source:meld.source<T>):T
local meld = {}

---@class (exact) meld.control_marker
meld.control_marker = {} -- empty but unique table used as a marker

---@class meld.control_handlers
meld.control_handlers = {}

---@class (exact) meld.control_op
---@field private marker meld.control_marker

---@class (exact) meld.delete_op : meld.control_op
---@field private op "delete"

---@return meld.delete_op
meld.delete = function() end

---@generic T
---@class (exact) meld.overwrite_op<T> : meld.control_op
---@field private op "overwrite"
---@field private data T

---@generic T
---@param new T
---@return meld.overwrite_op<T>
meld.overwrite = function(new) end

---@generic T
---@class (exact) meld.invoke_op<T> : meld.control_op
---@field private op "invoke"
---@field private fct fun(v:T):T

---@generic T
---@param fct fun(v:T):T
---@return meld.invoke_op<T>
meld.invoke = function(fct) end

---@generic T
---@class (exact) meld.append_op<T> : meld.control_op
---@field private op "append"
---@field private data T

---@generic T
---@param T[]
---@return meld.append_op<T>
meld.append = function(data) end

---@alias meld.source<T> (T extends table and {[K in keyof T]?: meld.source<T[K]>} or T)|meld.delete_op|meld.overwrite_op<T>|meld.invoke_op<T>|(T extends A[] and meld.append_op<A> or never)

--- recursive table merge but it reuses target table (does not deepcopy it). When target is not to be reused or more than
---  2 tables are to be merged, consider using util.merge. When there is conflict of 2 values, a value from the source will
---  win overwriting the existing value. There are also control structures available for extra operations that would not
---  be possible under normal merge rules
---@generic T
---@param target T
---@param source meld.source<T>
---@return T
meld.meld = function(target, source) end

return meld