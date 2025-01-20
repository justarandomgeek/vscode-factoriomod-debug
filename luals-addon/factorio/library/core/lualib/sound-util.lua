---@meta sound-util

---Will create a list of sound definitions.
---
---Uses the filename pattern of `"filepath".."-"..K..".ogg"` where K is the variation number.
---@param filename_string string
---@param variations integer
---@param volume_parameter? float
---@param modifiers_parameter? data.SoundModifier[]|data.SoundModifier
---@return data.SoundDefinition[]
function sound_variations(filename_string, variations, volume_parameter, modifiers_parameter) end

---Will create a list of sound definitions with volume variations.
---
---Uses the filename pattern of `"filepath".."-"..K..".ogg"` where K is the variation number.
---@param filename_string string
---@param variations integer
---@param min_volume? float
---@param max_volume? float
---@param modifiers_parameter? data.SoundModifier[]|data.SoundModifier
---@return data.SoundDefinition[]
function sound_variations_with_volume_variations(filename_string, variations, min_volume, max_volume, modifiers_parameter) end

---@param type_parameter data.SoundModifierType
---@param volume_multiplier_parameter float
---@return data.SoundModifier
function volume_multiplier(type_parameter, volume_multiplier_parameter) end
