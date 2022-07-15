let i = 100000;

export const overlay:{
	version: number
	custom: (ApiWithParameters&{name:string})[]
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
	version: 5,

	// whole classes not preset in json
	custom: [
		{
			name: "LuaObject",
			parameters: [
				{
					name: "valid",
					order: i++,
					description: "",
					optional: false,
					type: "boolean",
				},
				{
					name: "object_name",
					order: i++,
					description: "",
					optional: false,
					type: "string",
				},
			],
		},
		{
			name: "BlueprintCircuitConnection",
			parameters: [],
		},
		{
			name: "BlueprintControlBehavior",
			parameters: [
				{
					name: "condition",
					order: i++,
					description: "",
					optional: true,
					type: "CircuitCondition",
				},
				{
					name: "circuit_condition",
					order: i++,
					description: "",
					optional: true,
					type: "CircuitCondition",
				},
				{
					name: "filters",
					order: i++,
					description: "",
					optional: true,
					type: {
						complex_type: "array",
						value: "Signal"
					},
				},
				{
					name: "is_on",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "arithmetic_conditions",
					order: i++,
					description: "",
					optional: true,
					type: "ArithmeticCombinatorParameters",
				},
				{
					name: "decider_conditions",
					order: i++,
					description: "",
					optional: true,
					type: "DeciderCombinatorParameters",
				},
				{
					name: "circuit_enable_disable",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_read_resources",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_resource_read_mode",
					order: i++,
					description: "",
					optional: true,
					type: "defines.control_behavior.mining_drill.resource_read_mode",
				},
				{
					name: "read_stopped_train",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "train_stopped_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "read_from_train",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "send_to_train",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_mode_of_operation",
					order: i++,
					description: "",
					optional: true,
					// This should be the per-type defines but that's hard
					type: "number",
				},
				{
					name: "circuit_read_hand_contents",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_hand_read_mode",
					order: i++,
					description: "",
					optional: true,
					type: "defines.control_behavior.inserter",
				},
				{
					name: "circuit_set_stack_size",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "stack_control_input_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "use_colors",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "read_robot_stats",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "read_logistics",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "available_logistic_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "total_logistic_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "available_construction_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "total_construction_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "circuit_contents_read_mode",
					order: i++,
					description: "",
					optional: true,
					type: "defines.control_behavior.transport_belt",
				},
				{
					name: "output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "circuit_close_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "circuit_read_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "red_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "orange_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "green_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "blue_output_signal",
					order: i++,
					description: "",
					optional: true,
					type: "SignalID",
				},
				{
					name: "circuit_open_gate",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_read_sensor",
					order: i++,
					description: "",
					optional: true,
					type: "boolean",
				},
				{
					name: "circuit_parameters",
					order: i++,
					description: "",
					optional: true,
					type: "ProgrammableSpeakerCircuitParameters",
				},

			],
		},
	],

	// classes present in json that need members added/replaced
	adjust: {
		table: {
			"BlueprintEntity":{
				parameters:[
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
										value: "InventoryFilter"
									},
								},
							]
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
							value: "InventoryFilter"
						},
					},
					{
						name: "type",
						order: i++,
						description: "",
						optional: true,
						//TODO: "input"|"output"
						type: "string",
					},
					{
						name: "input_priority",
						order: i++,
						description: "",
						optional: true,
						//TODO: "left"|"right"
						type: "string",
					},
					{
						name: "output_priority",
						order: i++,
						description: "",
						optional: true,
						//TODO: "left"|"right"
						type: "string",
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
						//TODO: "whitelist"|"blacklist"
						type: "string",
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
							complex_type:"array",
							value: "LogisticFilter"
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
			"CapsuleAction":{
				parameters:[
					{
						name: "flare",
						order: i++,
						description: "",
						optional: true,
						type: "string",
					},
				],
			},
		},
		class: {
			"LuaLazyLoadedValue":{
				generic_params:["T"],
				generic_methods: [
					{
						name: "get",
						return_values: ["T"],
					}
				]
			},
			"LuaCustomTable":{
				generic_params:["K","V"],
				indexed: {
					key: "K",
					value: "V",
				},
			},
			"LuaFluidBox":{
				indexed: {
					key: "uint"
				}
			},
			"LuaGuiElement":{
				indexed: {
					key: {
						complex_type: "variant",
						options: [
							"string",
							"uint"
						]
					}
				}
			},
			"LuaInventory":{
				indexed: {
					key: "uint"
				}
			},
			"LuaTransportLine":{
				indexed: {
					key: "uint"
				}
			},
		},
		define: {
			"defines.prototypes": {
				subkeys: ["string", "string"]
			}
		}
	},
};