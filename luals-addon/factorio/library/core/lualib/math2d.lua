---@meta

---@class math2d
local math2d = {
  projection_constant = 0.7071067811865,
  vector = {},
  position = {},
  bounding_box = {}
}


---@class math2d_vector
---@field x number
---@field y number

---@alias math2d_position math2d_vector

---@alias math2d_position_union
---| math2d_position
---| Vector
---| MapPosition
---| TilePosition
---| GuiLocation

---@class math2d_bounding_box
---@field left_top math2d_position
---@field right_bottom math2d_position

---@alias math2d_bounding_box_union
---| math2d_bounding_box
---| BoundingBox


---@param orientation RealOrientation
---@param length number
---@return math2d_vector
function math2d.vector.from_orientation(orientation, length) end

---@param vec math2d_vector
---@return RealOrientation
function math2d.vector.to_orientation(vec) end

---@param vec math2d_vector
---@return number
function math2d.vector.length(vec) end

---@param vec math2d_vector
---@return math2d_vector
function math2d.vector.projected(vec) end

---Takes a position that might be either a two element array, or a table
---with x and y keys, and returns a position with x and y keys.
---@param pos math2d_position_union
---@return math2d_position
function math2d.position.ensure_xy(pos) end

---@param p1 math2d_position_union
---@param p2 math2d_position_union
---@return number
function math2d.position.distance_squared(p1, p2) end

---@param p1 math2d_position_union
---@param p2 math2d_position_union
---@return number
function math2d.position.distance(p1, p2) end

---@param vector math2d_position_union
---@param angle_in_deg number
---@return math2d_position
function math2d.position.rotate_vector(vector, angle_in_deg) end

---@param p1 math2d_position_union
---@param p2 math2d_position_union
---@return math2d_position
function math2d.position.subtract(p1, p2) end

---@param p1 math2d_position_union
---@param p2 math2d_position_union
---@return math2d_position
function math2d.position.add(p1, p2) end

---@param vec math2d_position_union
---@param scalar number
---@return math2d_position
function math2d.position.multiply_scalar(vec, scalar) end

---@param vec math2d_position_union
---@param scalar number
---@return math2d_position
function math2d.position.divide_scalar(vec, scalar) end

---@param vec math2d_position_union
---@return number
function math2d.position.vector_length(vec) end

---@param vec math2d_position_union
---@return math2d_position
function math2d.position.get_normalised(vec) end

---Takes a bounding box with positions that might be either two element arrays, or tables
---with x and y keys, and returns a bounding box with positions with x and y keys.
---@param bounding_box math2d_bounding_box_union
---@return math2d_bounding_box
function math2d.bounding_box.ensure_xy(bounding_box) end

---@param box math2d_bounding_box_union
---@return math2d_position
function math2d.bounding_box.get_centre(box) end

---@param box math2d_bounding_box_union
---@param point math2d_position_union
---@return boolean
function math2d.bounding_box.contains_point(box, point) end

---@param box math2d_bounding_box_union
---@param other math2d_bounding_box_union
---@return boolean
function math2d.bounding_box.contains_box(box, other) end

---@param box1 math2d_bounding_box_union
---@param box2 math2d_bounding_box_union
---@return boolean
function math2d.bounding_box.collides_with(box1,box2) end

---@param centre math2d_position_union
---@param width number
---@param height number
---@return math2d_bounding_box
function math2d.bounding_box.create_from_centre(centre, width, height) end

return math2d
