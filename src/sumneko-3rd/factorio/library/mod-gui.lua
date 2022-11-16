---@meta

--[[
Hello script explorer, if you are looking to upgrade your mod to use the mod gui, its pretty simple.

Typically you will have something like: `player.gui.left.add{...}`

All you will need to do, is change it to:
```lua
mod_gui.get_frame_flow(player).add{...}
```

And for buttons its just the same:
```lua
mod_gui.get_button_flow(player).add{...}
```

It should be as simple as find and replace.
Any other questions please feel free to ask on the modding help forum.
]]
---@class mod-gui
local mod_gui = {
  button_style = 'mod_gui_button',
  frame_style = 'non_draggable_frame'
}

---@param player LuaPlayer
---@return LuaGuiElement #The mod_gui button flow
function mod_gui.get_button_flow(player) end

---@param player LuaPlayer
---@return LuaGuiElement #The mod_gui frame flow
function mod_gui.get_frame_flow(player) end

return mod_gui