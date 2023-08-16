let i = 100000;

export const overlay:{
	adjust: {
		table: { [classname:string]: ApiWithParameters }
		class: { [classname:string]: {
			generic_params?: string[]
			generic_methods?: {
				name:string
				return_values:(string|undefined)[]
			}[]
			indexed?: {
				key: ApiType
				value?: ApiType
			}
		} }
		define: { [name:string]: {
			subkeys?:string[]
		}}
	}

} = {
	// classes present in json that need members added/replaced
	adjust: {
		table: {
			"BlueprintEntity": {
				parameters: [
					{
						name: "orientation",
						order: i++,
						description: "",
						optional: true,
						type: "number",
					},
					{
						name: "recipe",
						order: i++,
						description: "",
						optional: true,
						type: "string",
					},
					{
						name: "inventory",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "table",
							parameters: [
								{
									name: "bar",
									order: i++,
									description: "",
									optional: true,
									type: "number",
								},
								{
									name: "filters",
									order: i++,
									description: "",
									optional: true,
									type: {
										complex_type: "array",
										value: "InventoryFilter",
									},
								},
							],
						},
					},
					{
						name: "bar",
						order: i++,
						description: "",
						optional: true,
						type: "number",
					},
					{
						name: "filters",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "array",
							value: "InventoryFilter",
						},
					},
					{
						name: "type",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "union",
							options: [
								{
									complex_type: "literal",
									value: "input",
								},
								{
									complex_type: "literal",
									value: "output",
								},
							],
						},
					},
					{
						name: "input_priority",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "union",
							options: [
								{
									complex_type: "literal",
									value: "left",
								},
								{
									complex_type: "literal",
									value: "right",
								},
							],
						},
					},
					{
						name: "output_priority",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "union",
							options: [
								{
									complex_type: "literal",
									value: "left",
								},
								{
									complex_type: "literal",
									value: "right",
								},
							],
						},
					},
					{
						name: "filter",
						order: i++,
						description: "",
						optional: true,
						type: "string",
					},
					{
						name: "filter_mode",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "union",
							options: [
								{
									complex_type: "literal",
									value: "whitelist",
								},
								{
									complex_type: "literal",
									value: "blacklist",
								},
							],
						},
					},
					{
						name: "override_stack_size",
						order: i++,
						description: "",
						optional: true,
						type: "number",
					},
					{
						name: "request_filters",
						order: i++,
						description: "",
						optional: true,
						type: {
							complex_type: "array",
							value: "LogisticFilter",
						},
					},
					{
						name: "request_from_buffers",
						order: i++,
						description: "",
						optional: true,
						type: "boolean",
					},
					{
						name: "parameters",
						order: i++,
						description: "",
						optional: true,
						type: "ProgrammableSpeakerParameters",
					},
					{
						name: "alert_parameters",
						order: i++,
						description: "",
						optional: true,
						type: "ProgrammableSpeakerAlertParameters",
					},
					{
						name: "color",
						order: i++,
						description: "",
						optional: true,
						type: "Color",
					},
					{
						name: "station",
						order: i++,
						description: "",
						optional: true,
						type: "string",
					},
				],
			},
		},
		class: {
			"LuaLazyLoadedValue": {
				generic_params: ["T"],
				generic_methods: [
					{
						name: "get",
						return_values: ["T"],
					},
				],
			},
			"LuaCustomTable": {
				generic_params: ["K", "V"],
				indexed: {
					key: "K",
					value: "V",
				},
			},
			"LuaGuiElement": {
				indexed: {
					key: {
						complex_type: "union",
						options: [
							"string",
							"uint",
						],
					},
				},
			},
		},
		define: {
			"defines.prototypes": {
				subkeys: ["string", "string"],
			},
		},
	},
};