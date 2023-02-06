local test_meta_a = {

}
script.register_metatable("test_a", test_meta_a)

function Test_A(t)
	return setmetatable(t,test_meta_a)
end

local function firstof(lct)
	for key, value in pairs(lct) do
		return value
	end
end

function Make_Test_Global()
	local a = Test_A({id=1})
	local b = {[{true}]=a}
	global.test = {
		a,a,{},{[b]=b,[{1}]={2},[{}]={},},
		1,2,3,true,false,"foo",
		game.player,
		game.player.character,
		game.player.cursor_stack,
		game.player.force,
		game.player.surface,
		game.player.gui,
		game.permissions,
		game.create_profiler(true),
		game.player.surface.get_tile(0,0),
		firstof(game.player.force.recipes),
		firstof(game.player.force.technologies),
		firstof(game.permissions.groups),
		firstof(game.achievement_prototypes),
		firstof(game.ammo_category_prototypes),
		firstof(game.autoplace_control_prototypes),
		firstof(game.custom_input_prototypes),
		firstof(game.decorative_prototypes),
		firstof(game.damage_prototypes),
		firstof(game.entity_prototypes),
		firstof(game.equipment_category_prototypes),
		firstof(game.equipment_grid_prototypes),
		firstof(game.equipment_prototypes),
		firstof(game.fluid_prototypes),
		firstof(game.font_prototypes),
		firstof(game.fuel_category_prototypes),
		firstof(game.item_group_prototypes),
		firstof(game.item_prototypes),
		firstof(game.item_subgroup_prototypes),
		firstof(game.mod_setting_prototypes),
		firstof(game.module_category_prototypes),
		firstof(game.named_noise_expressions),
		firstof(game.noise_layer_prototypes),
		firstof(game.particle_prototypes),
		firstof(game.recipe_category_prototypes),
		firstof(game.recipe_prototypes),
		firstof(game.resource_category_prototypes),
		firstof(game.shortcut_prototypes),
		firstof(game.technology_prototypes),
		firstof(game.tile_prototypes),
		firstof(game.trivial_smoke_prototypes),
		firstof(game.virtual_signal_prototypes),
	}
end