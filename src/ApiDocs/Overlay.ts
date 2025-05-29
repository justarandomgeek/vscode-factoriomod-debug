export const overlay:{
	adjust: {
		table: { [classname:string]: {
				exact?: boolean
			}
		}
		class: { [classname:string]: {
			generic_params?: string[]
			generic_parent?: ApiType
			no_index?: boolean
			index_key?: ApiType
			split_funcs?: boolean
		} }
		define: { [name:string]: {
			owntype?:boolean
		}}
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
				generic_parent: "{get:fun():T}",
			},
			"LuaCustomTable": {
				generic_params: ["K", "V"],
				generic_parent: "{[K]:V}",
				no_index: true,
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
		define: {
			"defines.prototypes": {
				owntype: true,
			},
		},
	},
};