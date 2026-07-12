---@meta
---@namespace lualib
---@class resource_autoplace
local resource_autoplace = {}

-- Indicate that a patch set exists and optionally that it also needs a separate starting patch set.
-- Call this to initialize patch sets' indexes in a more deterministic order
-- (see resources.lua for an example) before calling resource_autoplace_settings.
---@param patch_set_name string
---@param has_starting_area_placement boolean
---@param autoplace_set_name? string
function resource_autoplace.initialize_patch_set(patch_set_name, has_starting_area_placement, autoplace_set_name) end

---@class autoplace_set
---@field regular patch_metaset
---@field starting patch_metaset

---@class patch_metaset
---@field autoplace_set_name string
---@field count_expression_name string
---@field private next_patch_set_index int
---@field private patch_set_indexes {[string]?:int}
---@field get_patch_set_index fun(self:self,string):int

---@type {[string]?:autoplace_set}
autoplace_sets = autoplace_sets or {}

---@param autoplace_set_name? string
---@return autoplace_set
function get_autoplace_set(autoplace_set_name)end

---@class resource_autoplace_settings_params
--- name for the type, used as the default autoplace control name and patch set name (each of which can be overridden separately)
---@field name string
--- amount of stuff, on average, to be placed per tile
---@field base_density number
--- name of the patch set; patches sets of the same name and seed1 will overlap
---
--- default: `name`
---@field patch_set_name? string
--- name of the corresponding autoplace control
---
--- default: `name`
---@field autoplace_control_name? string
--- probability of placement at any given tile within a patch
---
--- default: `1`
---@field random_probability? number
--- number of patches per square kilometer near the starting area
---
--- default: `2.5`
---@field base_spots_per_km2? number
--- `true`|`false`|`nil` - yes, no, and there is no special starting area, respectively
---@field has_starting_area_placement? boolean
--- random seed to use when generating patch positions
---
--- default: `100`
---@field seed1? int
---
---
---@ The rest of the fields are "undocumented"
---@ As in not in the comment before the function
---
--- default: `"default"`
---@field autoplace_set_name? string
--- default: `"d"`
---@field order? data.Order
---
--- default: `21`
---@field candidate_spot_count? int
--- default: `0.25`
---@field random_spot_size_minimum? number
--- default: `2`
---@field random_spot_size_maximum? number
--- default: `1`
---@field regular_blob_amplitude_multiplier? number
--- default: `1`
---@field regular_rq_factor_multiplier? number
--- default: `1`
---@field starting_blob_amplitude_multiplier? number
--- default: `1`
---@field starting_rq_factor_multiplier? number
---
--- default: `0`
---@field additional_richness? number
--- default: `0`
---@field minimum_richness? number
--- default: `1`
---@field richness_post_multiplier? number
--- Seemingly broken, so disabled the documentation
----@field create_named_expressions? boolean

---@param params resource_autoplace_settings_params
---@return data.AutoplaceSpecification
function resource_autoplace.resource_autoplace_settings(params) end

return resource_autoplace