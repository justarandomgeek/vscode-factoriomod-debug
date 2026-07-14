export const overlay:{
	adjust: {
		table: { [classname:string]: {
				generic_params?: {name:string; type?:ApiType}[]
				exact?: boolean
				parameters?: {
					[member:string]: {
						type?: ApiType
					}
				}
			}
		}
		class: { [classname:string]: {
			generic_params?: {name:string; type?:ApiType; default_?:string}[]
			generic_parent?: ApiType
			no_index?: boolean
			no_common_base?: boolean
			index_key?: ApiType
			index_value?: ApiType
			split_funcs?: boolean
			members?: {
				[member:string]: {
					type?: ApiType
				} & (
					{ rule?:undefined }|
					{ rule: "skip" }|
					{ rule: "mod-data" }|
					{ rule: "style" }|
					{ rule: "map-gen-presets" }|
					{ rule: "setting-names" }|
					{
						rule:"proto-names"
						protos_from?: string
					}
				)
			}
			methods?: {
				[member:string]: {
					generic_params?: {name:string; type?:ApiType}[]
					parameters?: ApiParameter<6>[]
					variadic_parameter?: ApiVariadicParameter<6>
					return_values?: ApiMethod["return_values"]
					asfield?:boolean
				} & (
					{ rule?:undefined }|
					{ rule: "on-event" }|
					{ rule: "set-event-filter"}
				)
			}
		} }
	}
} = {
	adjust: {
		table: {
			"BlueprintEntity": {
				exact: false,
			},
			"ModSetting": {
				generic_params: [{name: "T", type: "int32|double|boolean|string|Color"}],
				parameters: {
					value: {
						type: "T",
					},
				},
			},
		},
		class: {
			"LuaRemote": {
				methods: {
					call: {
						generic_params: [
							{name: "I", type: "(keyof LuaRemote.InterfaceMap)|string"},
							{name: "F", type: "I extends keyof LuaRemote.InterfaceMap and keyof LuaRemote.InterfaceMap[I] or string"},
							{name: "FF", type: "I extends keyof LuaRemote.InterfaceMap and LuaRemote.InterfaceMap[I][F] or (fun(...:Any):Any...)"},
						],
						parameters: [
							{
								name: "interface",
								type: "I",
								description: "",
								order: 1,
								optional: false,
							},
							{
								name: "fname",
								type: "F",
								description: "",
								order: 2,
								optional: false,
							},
						],
						variadic_parameter: {
							type: "Parameters<FF>...",
						},
						return_values: [
							{
								type: "ReturnType<FF>...",
								description: "",
								optional: false,
								order: 1,
							},
						],
					},
				},
			},
			"LuaLazyLoadedValue": {
				generic_params: [{name: "T"}],
				methods: {
					get: {
						asfield: true,
						return_values: [
							{
								order: 1,
								type: "T",
								description: "",
								optional: false,
							},
						],
					},
				},
			},
			"LuaCustomTable": {
				generic_params: [{name: "K"}, {name: "V"}],
				generic_parent: "table<K,V>",
				no_index: true,
				no_common_base: true,
				members: {
					"object_name": {rule: "skip"},
					"valid": {rule: "skip"},
				},
			},
			"LuaModData": {
				generic_params: [{name: "T", default_: "table<string,AnyBasic>"}],
				members: {
					data: {
						type: "T",
					},
				},
			},
			"LuaBootstrap": {
				methods: {
					"on_event": { rule: "on-event" },
					"set_event_filter": { rule: "set-event-filter" },
				},
			},
			"LuaPrototypes": {
				members: {
					font: { rule: "proto-names" },
					map_gen_preset: { rule: "map-gen-presets" },
					style: { rule: "style" },
					//utility_constants: { rule: },
					entity: { rule: "proto-names" },
					item: { rule: "proto-names" },
					fluid: { rule: "proto-names" },
					tile: { rule: "proto-names" },
					equipment: { rule: "proto-names" },
					damage: { rule: "proto-names", protos_from: "damage-type" },
					virtual_signal: { rule: "proto-names", protos_from: "virtual-signal" },
					equipment_grid: { rule: "proto-names", protos_from: "equipment-grid" },
					recipe: { rule: "proto-names" },
					technology: { rule: "proto-names" },
					decorative: { rule: "proto-names" },
					particle: { rule: "proto-names" },
					autoplace_control: { rule: "proto-names", protos_from: "autoplace-control" },
					mod_setting: { rule: "setting-names" },
					custom_input: { rule: "proto-names", protos_from: "custom-input" },
					ammo_category: { rule: "proto-names", protos_from: "ammo-category" },
					named_noise_expression: { rule: "proto-names", protos_from: "noise-expression" },
					named_noise_function: { rule: "proto-names", protos_from: "noise-function" },
					item_subgroup: { rule: "proto-names", protos_from: "item-subgroup" },
					item_group: { rule: "proto-names", protos_from: "item-group" },
					fuel_category: { rule: "proto-names", protos_from: "fuel-category" },
					resource_category: { rule: "proto-names", protos_from: "resource-category" },
					acheivement: { rule: "proto-names" },
					module_category: { rule: "proto-names", protos_from: "module-category" },
					equipment_category: { rule: "proto-names", protos_from: "equipment-category" },
					trivial_smoke: { rule: "proto-names", protos_from: "trivial-smoke" },
					shortcut: { rule: "proto-names" },
					recipe_category: { rule: "proto-names", protos_from: "recipe-category" },
					quality: { rule: "proto-names" },
					surface_property: { rule: "proto-names", protos_from: "surface-property" },
					space_location: { rule: "proto-names", protos_from: "space-location" },
					space_connection: { rule: "proto-names", protos_from: "space-connection" },
					custom_event: { rule: "proto-names", protos_from: "custom-event" },
					active_trigger: { rule: "proto-names", protos_from: "active-trigger" },
					asteroid_chunk: { rule: "proto-names", protos_from: "asteroid-chunk" },
					collision_layer: { rule: "proto-names", protos_from: "collision-layer" },
					airborne_pollutant: { rule: "proto-names", protos_from: "airborne-pollutant" },
					burner_usage: { rule: "proto-names", protos_from: "burner-usage" },
					mod_data: { rule: "mod-data" },
					surface: { rule: "proto-names" },
					procession: { rule: "proto-names" },
					procession_layer_inheritance_group: { rule: "proto-names", protos_from: "procession-layer-inheritance-group" },
				},
			},
			"LuaGuiElement": {
				index_key: {
					complex_type: "union",
					options: [
						"string",
						"uint",
					],
				},
				split_funcs: true,
			},
			"LuaPlayer": {
				members: {
					mod_settings: {
						type: "PlayerModSettings",
					},
				},
			},
			"LuaSettings": {
				members: {
					startup: {
						type: "StartupModSettings",
					},
					global: {
						type: "GlobalModSettings",
					},
					player_default: {
						type: "PlayerModSettings",
					},
				},
				methods: {
					get_player_settings: {
						return_values: [
							{
								order: 1,
								type: "PlayerModSettings",
								description: "",
								optional: false,
							},
						],
					},
				},
			},
		},
	},
};