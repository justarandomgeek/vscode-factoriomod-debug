## Custom Debug Views

The debug views of tables can be customized using metatables to override default rendering.

The default lineitem for a table can be overridden by the metamethod `__debugline`, which can be either a string or a function `__debugline(self)->string` which takes the table as an argument and returns a string. If `__debugline` is a string, [String Interpolation](./debugapi.md#string-interpolation) will be applied, with members of the current object avaliable to expressions, as well as the object itself as `self`.

The typename for a table can be overridden by a string in the metatable field `__debugtype`.

By default, the metatable will be listed as a virtual member `<metatable>`.The displayed contents of the table can be overridden with `__debugcontents` which can be `false` to omit contents entirely, or a function `__debugcontents(self,extra?)->__debugnext,t,k` which returns an iterator `__debugnext(t,k)->nextk,nextv,renderOpts?`.

```lua
---@class DebugAdapter.RenderOptions
---@field rawName? boolean
---@field rawValue? boolean
---@field virtual? boolean
---@field ref? table|function @ Object to expand children of instead of this value
---@field fetchable? boolean @ if ref or value is function, treat as fetchable property instead of raw function
---@field extra? any @ Extra object to pass back to `__debugcontents`
```

If using [hediet.debug-visualizer](https://marketplace.visualstudio.com/items?itemName=hediet.debug-visualizer), you can configure it to use `"context": "visualize"` to get json output on its eval requests. You must provide your own object conversions to produce objects compatible with the visualizer interface types. If the eval result has a `__debugvisualize(self)` metamethod, it will be called automatically before being converted to json.