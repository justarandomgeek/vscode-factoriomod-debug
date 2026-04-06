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
			generic_params?: {name:string; type?:ApiType}[]
			generic_parent?: ApiType
			index_key?: ApiType
			index_value?: ApiType
			split_funcs?: boolean
			members?: {
				[member:string]: {
					type?: ApiType
				}
			}
			methods?: {
				[member:string]: {
					asfield?:boolean
					return_values?: ApiMethod["return_values"]
				}
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
				index_key: "K",
				index_value: "V",
			},
			"LuaModData": {
				generic_params: [{name: "T", type: "{[string]: AnyBasic}"}],
				members: {
					data: {
						type: "T",
					},
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