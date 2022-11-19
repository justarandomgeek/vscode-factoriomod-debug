---@meta

---
---
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug"])
---
---@class factorio.debuglib
debug = {}

---@class debuginfo
---@field name            string
---@field namewhat        string
---@field source          string
---@field short_src       string
---@field linedefined     integer
---@field lastlinedefined integer
---@field what            string
---@field currentline     integer
---@field istailcall      boolean
---@field nups            integer
---@field nparams         integer
---@field isvararg        boolean
---@field func            function
---@field activelines     table
---@field currentpc       number

---
---Enters an interactive mode with the user, running each string that the user enters.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.debug"])
---
function debug.debug() end

---
---Returns the current hook settings of the thread.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.gethook"])
---
---@return function hook
---@return string mask
---@return integer count
---@nodiscard
function debug.gethook() end

---@alias infowhat string
---|+'"n"'     # `name` and `namewhat`
---|+'"S"'     # `source`, `short_src`, `linedefined`, `lastlinedefined`, and `what`
---|+'"l"'     # `currentline`
---|+'"t"'     # `istailcall`
---|+'"u"' # `nups`, `nparams`, and `isvararg`
---|+'"f"'     # `func`
---|+'"L"'     # `activelines`
---|+'"p"'     # `currentpc`

---
---Returns a table with information about a function.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getinfo"])
---
---@param f      integer|async fun(...):...
---@param what?  infowhat
---@return debuginfo
---@nodiscard
function debug.getinfo(f, what) end

---
---Returns the name and the value of the local variable with index `local` of the function at level `f` of the stack.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getlocal"])
---
---@param f       integer|async fun(...):...
---@param index   integer
---@return string name
---@return any    value
---@nodiscard
function debug.getlocal(f, index) end

---
---Returns the metatable of the given value.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getmetatable"])
---
---@param object any
---@return table metatable
---@nodiscard
function debug.getmetatable(object) end

---
---Returns the registry table.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getregistry"])
---
---@return table
---@nodiscard
function debug.getregistry() end

---
---Returns the name and the value of the upvalue with index `up` of the function.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getupvalue"])
---
---@param f  async fun(...):...
---@param up integer
---@return string name
---@return any    value
---@nodiscard
function debug.getupvalue(f, up) end

---
---Returns the Lua value associated to u.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.getuservalue"])
---
---@param u userdata
---@return any
---@nodiscard
function debug.getuservalue(u) end

---
---### **Deprecated in `Lua 5.4.2`**
---
---Sets a new limit for the C stack. This limit controls how deeply nested calls can go in Lua, with the intent of avoiding a stack overflow.
---
---In case of success, this function returns the old limit. In case of error, it returns `false`.
---
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.setcstacklimit"])
---
---@deprecated
---@param limit integer
---@return integer|boolean
function debug.setcstacklimit(limit) end

---@alias hookmask string
---|+'"c"' # Calls hook when Lua calls a function.
---|+'"r"' # Calls hook when Lua returns from a function.
---|+'"l"' # Calls hook when Lua enters a new line of code.

---
---Sets the given function as a hook.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.sethook"])
---
---@overload fun(...):...
---@param hook   async fun(...):...
---@param mask   hookmask
---@param count? integer
function debug.sethook(hook, mask, count) end

---
---Assigns the `value` to the local variable with index `local` of the function at `level` of the stack.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.setlocal"])
---
---@param level  integer
---@param index  integer
---@param value  any
---@return string name
function debug.setlocal(level, index, value) end

---
---Sets the metatable for the given value to the given table (which can be `nil`).
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.setmetatable"])
---
---@generic T
---@param value T
---@param meta? table
---@return T value
function debug.setmetatable(value, meta) end

---
---Assigns the `value` to the upvalue with index `up` of the function.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.setupvalue"])
---
---@param f     async fun(...):...
---@param up    integer
---@param value any
---@return string name
function debug.setupvalue(f, up, value) end

---
---Sets the given value as the Lua value associated to the given udata.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.setuservalue"])
---
---@param udata userdata
---@param value any
---@return userdata udata
function debug.setuservalue(udata, value) end

---
---Returns a string with a traceback of the call stack. The optional message string is appended at the beginning of the traceback.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.traceback"])
---
---@overload fun(message?: any, level?: integer): string
---@param thread   thread
---@param message? any
---@param level?   integer
---@return string  message
---@nodiscard
function debug.traceback(thread, message, level) end

---
---Returns a unique identifier (as a light userdata) for the upvalue numbered `n` from the given function.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.upvalueid"])
---
---@param f async fun(...):...
---@param n integer
---@return lightuserdata id
---@nodiscard
function debug.upvalueid(f, n) end

---
---Make the `n1`-th upvalue of the Lua closure `f1` refer to the `n2`-th upvalue of the Lua closure `f2`.
---
---[View documents](command:extension.lua.doc?["en-us/52/manual.html/pdf-debug.upvaluejoin"])
---
---@param f1 async fun(...):...
---@param n1 integer
---@param f2 async fun(...):...
---@param n2 integer
function debug.upvaluejoin(f1, n1, f2, n2) end

return debug
