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

---@class (exact) overwrite_op<T> : control_op
---@field private op "overwrite"
---@field private data T

---@generic T
---@param new T
---@return overwrite_op<T>
meld.overwrite = function(new) end

---@class (exact) invoke_op<T> : control_op
---@field private op "invoke"
---@field private fct fun(v:T):T

---@generic T
---@param fct fun(v:T):T
---@return invoke_op<T>
meld.invoke = function(fct) end

---@class (exact) append_op<T> : control_op
---@field private op "append"
---@field private data T

---@generic T
---@param data T[]
---@return append_op<T>
meld.append = function(data) end

-- emmy can't handle fully recursive mapped types, so just do a reasonable number of levels...

---@alias op<T> delete_op|overwrite_op<T>|invoke_op<T>|(T extends infer A[] and append_op<A> or never)

---@alias field5<T> T|op<T>|(T extends {[infer KK]: infer VV} and {[K in keyof T]?: T[K]} or never)
---@alias field4<T> T|op<T>|(T extends {[infer KK]: infer VV} and {[K in keyof T]?: field5<T[K]>} or never)
---@alias field3<T> T|op<T>|(T extends {[infer KK]: infer VV} and {[K in keyof T]?: field4<T[K]>} or never)
---@alias field2<T> T|op<T>|(T extends {[infer KK]: infer VV} and {[K in keyof T]?: field3<T[K]>} or never)
---@alias field<T> T|op<T>|(T extends {[infer KK]: infer VV} and {[K in keyof T]?: field2<T[K]>} or never)
---@alias source<T> {[K in keyof T]?: field<T[K]>}|T

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