export const overlay:{
	adjust: {
		table: { [classname:string]: {
				exact?: boolean
			}
		}
		class: { [classname:string]: {
			generic_params?: string[]
			generic_parent?: ApiType
			index_key?: ApiType
			index_value?: ApiType
			split_funcs?: boolean
			members?: {
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
		},
		class: {
			"LuaLazyLoadedValue": {
				generic_params: ["T"],
				members: {
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
				generic_params: ["K", "V"],
				index_key: "K",
				index_value: "V",
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
		},
	},
};