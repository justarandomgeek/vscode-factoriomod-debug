local invert = require("__debugadapter__/enumutil.lua").invert
local __DebugAdapter = __DebugAdapter
local script = script
local pcall = pcall
local validLuaObjectTypes = {table=true,userdata=true}


local luaObjectInfo = {
  alwaysValid = {},
  eventlike = {},
  expandKeys = {},
}
do
  local objectChunks = {"return "}

  function __DebugAdapter.loadObjectInfo(chunk)
    if chunk then
      objectChunks[#objectChunks+1] = chunk
    else
      luaObjectInfo = load(table.concat(objectChunks),"=(objectinfo)","t")()
    end
  end
  print("DBG: object_info")
  debug.debug()
  __DebugAdapter.loadObjectInfo = nil
end

luaObjectInfo.lineItem = {
  ---@param stack LuaItemStack
  ---@param short boolean | nil
  LuaItemStack = function(stack,short)
    if stack.valid_for_read then
      if not short then
        return __DebugAdapter.stringInterp(
          [[<LuaItemStack>{[}name={name}, count={count}{]}]],
          nil,
          stack,
          "luaobjectline"
        )
      else
        return [[<LuaItemStack>]]
      end
    else
      return [[<Empty LuaItemStack>]]
    end
  end,
  LuaPlayer = [[<LuaPlayer>{[}name={name}, index={index}{]}]],
  LuaSurface = [[<LuaSurface>{[}name={name}, index={index}{]}]],
  LuaForce = [[<LuaForce>{[}name={name}, index={index}{]}]],
  LuaGuiElement = [[<LuaGuiElement>{[}name={name}, type={type}, index={index}{]}]],
  LuaStyle = [[<LuaStyle>{[}name={name}{]}]],
  LuaEntity = [[<LuaEntity>{[}name={name}, type={type}, unit_number={unit_number}{]}]],
}

--[[
LuaObjects since 1.1.49 share metatables per class, and the metatables are held
in the registry by class name once an object of that class has been created.
The LuaObject table has an extra object pointer in its header replacing what
was previously in the `__self` userdata (which is now empty).

From 1.2 onward, the LuaObject itself is a userdata instead of a table,
and `__self` is gone.

Most meta funcs have single upval,
  userdata(pointer to member function)
  object pointers are retrieved from the LuaObject passed in param 1 when calling

`__eq` is shared by all, and has two (also in registry as `luaobject__eq`)
  userdata(pointer to object (`game`))
  userdata(pointer to member function(`__eq`))

Normal API functions have three upvals:
  userdata(pointer to object),
  userdata(pointer to member function),
  LuaObject(parent object)

all functions from one object will have the same value in the first
all instances of the same class::function will have the same value in the second
third is the parent LuaObject of the specific api closure, to keep it from being disposed

some API functions can raise events (or otherwise re-enter lua) before returning,
so we want to recognize them to record the stack somewhere and indicate that it
needs to be requested if something stops in the lower stack.

most of this information is loaded from the json now, but we have a few
special cases to add...

]]
local eventlike_members = {
  -- userdata => {class="",member=""}
}
local eventlike = luaObjectInfo.eventlike or {}
eventlike.__index = eventlike.__index or {}
-- not from json
eventlike.__index.LuaBootstrap = eventlike.__index.LuaBootstrap or {}
eventlike.__index.LuaBootstrap.raise_event = true

-- not from json, non-event re-entry to other lua
eventlike.__index.LuaRemote = eventlike.__index.LuaRemote or {}
eventlike.__index.LuaRemote.call = true

--just catch any write to a LuaCustomTable, to cover mod settings
--all LuaCustomTable::__newindex use the same pointer-to-member userdata
--so we can't differentiate them from here.
eventlike.__newindex = eventlike.__newindex or {}
eventlike.__newindex.LuaCustomTable = eventlike.__newindex.LuaCustomTable or {}
eventlike.__newindex.LuaCustomTable = setmetatable({},{__index = function() return true end})


---Test if a hooked call/return represents an event-like api call
---@param level number the stack level of the code interrupted by the hook
---@param hooktype string the debug hook type we're in while checking this
---@return boolean is_eventlike
---@return string classname
---@return string method
---@return any value if api access was a `__newindex` call
local function check_eventlike(level,hooktype)
  if not script then return end

  local info = debug.getinfo(level,"nSf")
  if not info then return end

  if info.what ~= "C" then return end

  local fname = info.name
  local classes = eventlike[fname]
  if classes then -- __index or __newindex

    local _,t = debug.getlocal(level,1)
    if (not validLuaObjectTypes[type(t)]) or getmetatable(t) ~= "private" then return end

    ---@type string
    local tname = t.object_name
    if not tname then return end

    local class = classes[tname]
    if not class then return end

    local _,k = debug.getlocal(level,2)
    local member = class[k]
    if member then
      if fname == "__index" then
        if hooktype == "call" or hooktype == "tail call" then
          -- there's no good way to get return values, so fetch it myself once in call instead
          -- and get the userdata so we can compare things...
          -- pcall in case it's a bad lookup
          local success,func = pcall(function () return t[k] end)
          if success and type(func)=="function" then
            local _,memberptr = debug.getupvalue(func,2)
            eventlike_members[memberptr] = {class=tname,member=k}
            -- only need to do this once, so unhook it once we get one!
            class[k] = nil
            if not next(class) then
              classes[tname] = nil
            end
          end
        end
        -- this call is not eventlike itself, but the returned func will be
        return --false,tname,k

      else -- __newindex
        -- do the thing
        return true,tname,k,(select(2,debug.getlocal(level,3)))
      end
    end

  else -- other cfunctions, not __index or __newindex

    local f = info.func
    local _,memberptr = debug.getupvalue(f,2)
    if memberptr then
      local member = eventlike_members[memberptr]
      if member then
        -- do the thing
        return true,member.class,member.member
      end
    end

  end
end
luaObjectInfo.check_eventlike = check_eventlike

local function try_object_name(obj)
  -- basic checks for LuaObject-like things: is table(<=1.1) or usedata(>=1.2), has masked meta
  if not validLuaObjectTypes[type(obj)] then return end

  local mt = debug.getmetatable(obj)
  if not mt then return end
  if mt.__metatable ~= "private" then return end

  -- don't check for __self=userdata becuase that is planned to be removed in the future

  -- LuaBindableObjects don't have `isluaobject`, so use `object_name` instead
  -- pcall in case it's still not a real LuaObject...
  local success,object_name = pcall(mt.__index,obj,"object_name")
  if success then
    return object_name
  end
end
luaObjectInfo.try_object_name = try_object_name

luaObjectInfo.alwaysValid.LuaMapSettings = true
luaObjectInfo.alwaysValid.LuaDifficultySettings = true
luaObjectInfo.alwaysValid.LuaGameViewSettings = true

local enumSpecial = {
  ["defines.circuit_connector_id"] = function() --1.1
    ---@diagnostic disable-next-line: undefined-field
    local circuit_connector_id = defines.circuit_connector_id
    local combinator = invert(circuit_connector_id,"defines.circuit_connector_id.",function(k,v) return (not not string.match(k,"^combinator")) end)
    local netnames = {
      ["accumulator"] = {[circuit_connector_id.accumulator] = "defines.circuit_connector_id.accumulator"},
      ["container"] = {[circuit_connector_id.container] = "defines.circuit_connector_id.container"},
      ["logistic-container"] = {[circuit_connector_id.container] = "defines.circuit_connector_id.container"},
      ["programmable-speaker"] = {[circuit_connector_id.programmable_speaker] = "defines.circuit_connector_id.programmable_speaker"},
      ["rail-signal"] = {[circuit_connector_id.rail_signal] = "defines.circuit_connector_id.rail_signal"},
      ["rail-chain-signal"] = {[circuit_connector_id.rail_chain_signal] = "defines.circuit_connector_id.rail_chain_signal"},
      ["roboport"] = {[circuit_connector_id.roboport] = "defines.circuit_connector_id.roboport"},
      ["storage-tank"] = {[circuit_connector_id.storage_tank] = "defines.circuit_connector_id.storage_tank"},
      ["wall"] = {[circuit_connector_id.wall] = "defines.circuit_connector_id.wall"},
      ["electric-pole"] = {[circuit_connector_id.electric_pole] = "defines.circuit_connector_id.electric_pole"},
      ["inserter"] = {[circuit_connector_id.inserter] = "defines.circuit_connector_id.inserter"},
      ["lamp"] = {[circuit_connector_id.lamp] = "defines.circuit_connector_id.lamp"},
      ["pump"] = {[circuit_connector_id.pump] = "defines.circuit_connector_id.pump"},
      ["ofshore-pump"] = {[circuit_connector_id.offshore_pump] = "defines.circuit_connector_id.ofshore_pump"},

      ["constant-combinator"] = {[circuit_connector_id.constant_combinator] = "defines.circuit_connector_id.constant_combinator"},

      ["decider-combinator"] = combinator,
      ["arithmetic-combinator"] = combinator,
    }
    return function(network,id)
      local names = netnames[network.entity.type]
      if names then
        return names[id]
      end
    end
  end,
  ["defines.inventory"] = function()
    local burner = {
      [defines.inventory.fuel] = "defines.inventory.fuel",
      [defines.inventory.burnt_result] = "defines.inventory.burnt_result",
    }
    local function with(super,t) return setmetatable(t,{__index = super}) end

    local chest = {
      [defines.inventory.chest] = "defines.inventory.chest",
    }

    local assembler = with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^assembling_machine_") end))

    local character = invert(defines.inventory,"defines.inventory.",function(k,v) return (not not string.match(k,"^character_")) and k ~= "character_corpse" end)
    local robot = invert(defines.inventory,"defines.inventory.",function(k,v) return (not not string.match(k,"^robot_")) end)

    local invname = {
      burner = burner,
      item = invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^item_") end),
      player = {
        [defines.controllers.character] = character,
        [defines.controllers.god] =
          invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^god_") end),
        [defines.controllers.editor] =
          invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^editor_") end),
      },
      entity = {
        ["container"]=chest,
        ["logistic-container"]=chest,
        ["cargo-wagon"]={ [defines.inventory.cargo_wagon] = "defines.inventory.cargo_wagon" },
        ["rocket-silo-rocket"]={ [defines.inventory.cargo_wagon] = "defines.inventory.rocket" },

        ["construction-robot"]=robot,
        ["logistic-robot"]=robot,

        ["ammo-turret"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^turret_") end),
        ["artillery-turret"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^artillery_turret_") end),
        ["artillery-wagon"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^artillery_wagon_") end),
        ["roboport"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^roboport_") end),
        ["beacon"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^beacon_") end),
        ["character-corpse"]=invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^character_corpse_") end),

        ["furnace"]=with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^furnace_") end)),
        ["assembling-machine"]=assembler,
        ["mining-drill"]=with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^mining_drill_") end)),
        ["lab"]=with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^lab_") end)),
        ["car"]=with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^car_") end)),
        ["spider-vehicle"]=with(burner,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^spider_") end)),
        ["rocket-silo"]=with(assembler,invert(defines.inventory,"defines.inventory.",function(k,v) return not not string.match(k,"^rocket_silo_") end)),

      },
    }
    return function(inv,index)
      local owner = inv.player_owner
      if owner then
        -- check if player is character/god/editor
        local names = invname.player[owner.controller_type]
        if names then
          return names[index]
        end
        return
      end
      owner = inv.equipment_owner
      if owner then
        -- burner inside equipment
        return invname.burner[index]
      end
      owner = inv.entity_owner
      if owner then
        -- check entity type
        local names = invname.entity[owner.type]
        if names then
          return names[index]
        end
        return
      end
      owner = inv.mod_owner
      if owner then
        return nil
      end
      local names = invname.item
      return names[index]
    end
  end,
  ["defines.transport_line"] = function() end,
  ["defines.circuit_condition_index"] = function() end, --1.2
  ["defines.wire_connector_id"] = function () --1.2
    ---@diagnostic disable-next-line: undefined-field
    local wire_connector_id = defines.wire_connector_id
    local default = invert(wire_connector_id,"defines.wire_connector_id.",function(k,v) return (not not string.match(k,"^circuit")) end)
    local combinator = invert(wire_connector_id,"defines.wire_connector_id.",function(k,v) return (not not string.match(k,"^combinator")) end)
    local pole = invert(wire_connector_id,"defines.wire_connector_id.",function(k,v) return (not not string.match(k,"^pole")) end)
    local switch = invert(wire_connector_id,"defines.wire_connector_id.",function(k,v) return (not not string.match(k,"^power_switch")) end)
    local entity = {
      ["electric-pole"] = pole,
      ["power-switch"] = switch,
      ["decider-combinator"] = combinator,
      ["arithmetic-combinator"] = combinator,
    }

    return function(obj,id)
      local object_name = obj.object_name
      local owner
      if object_name == "LuaCircuitNetwork" then
        owner = obj.entity
      elseif object_name == "LuaWireConnector" then
        owner = obj.owner
      else
        return
      end
      local map = entity[owner.type]
      if map then
        return map[id] or default[id]
      else
        return default[id]
      end
    end
  end,
}

for _, class in pairs(luaObjectInfo.expandKeys) do
  for _,prop in pairs(class) do
    local enumFrom = prop.enumFrom
    prop.enumFrom = nil
    if enumFrom then
      local special = enumSpecial[enumFrom]
      if special then
        local success,result = pcall(special)
        if success and result then
          prop.enum = result
        end
      else
        local success,result = pcall(function()
          return load("return " .. enumFrom)()
        end)
        if success then
          prop.enum = invert(result, enumFrom .. ".")
        end
      end
    end
  end
end

local extraKeys = {
  LuaProfiler = {
    ["<translated>"] = {thisTranslated = true},
  },
  LuaDifficultySettings = {
    recipe_difficulty = {},
    technology_difficulty = {},
    technology_price_multiplier = {},
    research_queue_setting = {},
  },
  LuaGameViewSettings = {
    show_controller_gui = {},
    show_minimap = {},
    show_research_info = {},
    show_entity_info = {},
    show_alert_gui = {},
    update_entity_selection = {},
    show_rail_block_visualisation = {},
    show_side_menu = {},
    show_map_view_options = {},
    show_quickbar = {},
    show_shortcut_bar = {},
  },
  LuaMapSettings = {
    pollution = {},
    enemy_evolution = {},
    enemy_expansion = {},
    unit_group = {},
    steering = {},
    path_finder = {},
    max_failed_behavior_count = {},
  },

  ["LuaMapSettings.pollution"] = {
    enabled = {},
    diffusion_ratio = {},
    min_to_diffuse = {},
    ageing = {},
    expected_max_per_chunk = {},
    min_to_show_per_chunk = {},
    min_pollution_to_damage_trees = {},
    pollution_with_max_forest_damage = {},
    pollution_per_tree_damage = {},
    pollution_restored_per_tree_damage = {},
    max_pollution_to_restore_trees = {},
    enemy_attack_pollution_consumption_modifier = {},
  },
  ["LuaMapSettings.enemy_evolution"] = {
    enabled = {},
    time_factor = {},
    destroy_factor = {},
    pollution_factor = {},
  },
  ["LuaMapSettings.enemy_expansion"] = {
    enabled = {},
    max_expansion_distance = {},
    friendly_base_influence_radius = {},
    enemy_building_influence_radius = {},
    building_coefficient = {},
    other_base_coefficient = {},
    neighbouring_chunk_coefficient = {},
    neighbouring_base_chunk_coefficient = {};
    max_colliding_tiles_coefficient = {},
    settler_group_min_size = {},
    settler_group_max_size = {},
    min_expansion_cooldown = {},
    max_expansion_cooldown = {},
  },
  ["LuaMapSettings.unit_group"] = {
    min_group_gathering_time = {},
    max_group_gathering_time = {},
    max_wait_time_for_late_members = {},
    max_group_radius = {},
    min_group_radius = {},
    max_member_speedup_when_behind = {},
    max_member_slowdown_when_ahead = {},
    max_group_slowdown_factor = {},
    max_group_member_fallback_factor = {},
    member_disown_distance = {},
    tick_tolerance_when_member_arrives = {},
    max_gathering_unit_groups = {},
    max_unit_group_size = {},
  },
  ["LuaMapSettings.steering"] = {
    default = {}, moving = {},
  },
  ["LuaMapSettings.steering.default"] = {
    radius = {},
    separation_force = {},
    separation_factor = {},
    force_unit_fuzzy_goto_behavior = {},
  },
  ["LuaMapSettings.steering.moving"] = {
    radius = {},
    separation_force = {},
    separation_factor = {},
    force_unit_fuzzy_goto_behavior = {},
  },
  ["LuaMapSettings.path_finder"] = {
    fwd2bwd_ratio = {},
    goal_pressure_ratio = {},
    max_steps_worked_per_tick = {},
    max_work_done_per_tick = {},
    use_path_cache = {},
    short_cache_size = {},
    long_cache_size = {},
    short_cache_min_cacheable_distance = {},
    short_cache_min_algo_steps_to_cache = {},
    long_cache_min_cacheable_distance = {},
    cache_max_connect_to_cache_steps_multiplier = {},
    cache_accept_path_start_distance_ratio = {},
    cache_accept_path_end_distance_ratio = {},
    negative_cache_accept_path_start_distance_ratio = {},
    negative_cache_accept_path_end_distance_ratio = {},
    cache_path_start_distance_rating_multiplier = {},
    cache_path_end_distance_rating_multiplier = {},
    stale_enemy_with_same_destination_collision_penalty = {},
    ignore_moving_enemy_collision_distance = {},
    enemy_with_different_destination_collision_penalty = {},
    general_entity_collision_penalty = {},
    general_entity_subsequent_collision_penalty = {},
    extended_collision_penalty = {},
    max_clients_to_accept_any_new_request = {},
    max_clients_to_accept_short_new_request = {},
    direct_distance_to_consider_short_request = {},
    short_request_max_steps = {},
    short_request_ratio = {},
    min_steps_to_check_path_find_termination = {},
    start_to_goal_cost_multiplier_to_terminate_path_find = {},
  },
}

for classname, class in pairs(extraKeys) do
  local c = luaObjectInfo.expandKeys[classname]
  if c then
    for propname,prop in pairs(class) do
      c[propname] = c[propname] or prop
    end
  else
    luaObjectInfo.expandKeys[classname] = class
  end
end

return __DebugAdapter.stepIgnore(luaObjectInfo)