--[[
| bits | U+first   | U+last     | bytes | Byte_1   | Byte_2   | Byte_3   | Byte_4   | Byte_5   | Byte_6   |
+------+-----------+------------+-------+----------+----------+----------+----------+----------+----------+
|   7  | U+0000    | U+007F     |   1   | 0xxxxxxx |          |          |          |          |          |
|  11  | U+0080    | U+07FF     |   2   | 110xxxxx | 10xxxxxx |          |          |          |          |
|  16  | U+0800    | U+FFFF     |   3   | 1110xxxx | 10xxxxxx | 10xxxxxx |          |          |          |
|  21  | U+10000   | U+1FFFFF   |   4   | 11110xxx | 10xxxxxx | 10xxxxxx | 10xxxxxx |          |          |
+------+-----------+------------+-------+----------+----------+----------+----------+----------+----------+
| *26  | U+200000  | U+3FFFFFF  |   5   | 111110xx | 10xxxxxx | 10xxxxxx | 10xxxxxx | 10xxxxxx |          |
| *32  | U+4000000 | U+FFFFFFFF |   6   | 111111xx | 10xxxxxx | 10xxxxxx | 10xxxxxx | 10xxxxxx | 10xxxxxx |

VarInt based on UTF-8, extended for full 32bit ints in 6byte form.

--]]

local tconcat = table.concat
local string = string
local sbyte = string.byte
local schar = string.char
local ssub = string.sub
local bit32 = bit32
local band = bit32.band
local bor = bit32.bor
local lshift = bit32.lshift
local rshift = bit32.rshift

local stepIgnore = __DebugAdapter and __DebugAdapter.stepIgnore or function() end


--- reads an int from str starting at index.
---@param str string
---@param index number
---@return number value
---@return number nextIndex
local function ReadVarInt(str,index)

    local c = sbyte(str, index) or 0
    local seq = c < 0x80 and 1 or c < 0xE0 and 2 or c < 0xF0 and 3 or c < 0xF8 and 4 or c < 0xFC and 5 or 6

    if seq == 1 then
        return c,index+1
    else
        local val = band(c, 2^(8-seq) - 1)

        for i=1,seq-1 do
            val = bor(lshift(val, 6), band(sbyte(str, index+i), 0x3F))
        end

        -- escape \n
        if val == 0xFFFFFFFF then val = 10 end
        if val == 0xFFFFFFFE then val = 26 end
        if val == 0xFFFFFFFD then val = 13 end

        return val,index+seq
    end
end
stepIgnore(ReadVarInt)

--- convert an int to a string containing the encoded value
---@param val number
---@return string varintstr
local function WriteVarInt(val)
    local prefix, firstmask, startshift

    if val < 0x80 then
        --[[1 byte]]
        return schar(val)
    elseif val < 0x0800 then
        --[[2 bytes]]
        prefix = 0xc0
        firstmask = 0x1f
        startshift = 6
    elseif val < 0x10000 then
        --[[3 bytes]]
        prefix = 0xe0
        firstmask = 0x0f
        startshift = 12
    elseif val < 0x200000 then
        --[[4 bytes]]
        prefix = 0xf0
        firstmask = 0x07
        startshift = 18
    elseif val < 0x4000000 then
        --[[5 bytes]]
        prefix = 0xf8
        firstmask = 0x03
        startshift = 24
    else
        --[[6 bytes]]
        prefix = 0xfc
        firstmask = 0x03
        startshift = 30
    end

    local s = {}
    s[#s+1] = schar(bor(prefix, band(rshift(val,startshift),firstmask)))
    for shift=startshift-6,0,-6 do
        s[#s+1] = schar(bor(0x80, band(rshift(val,shift),0x3f)))
    end
    return tconcat(s)
end


--[[
breakpoints = {
    VarInt filenamelength
    string filename
    byte numplain, FF = no plain, FE = 10
    varint[] plain bps
    byte numcomplex, FF = no complex, FE = 10
    bp[]
    {
        varint line
        byte hasextra, 0x01 = condition | 0x02 = hitcount | 0x04 = logMessage
        extras[] -- in order, condition then hit then log
        {
            varint length
            string expression
        }
    }
}
]]

---@param strdata string
---@param i number
---@return string strout
---@return number nextIndex
local function ReadString(strdata,i)
    local val
    val,i = ReadVarInt(strdata,i)
    val = i+val
    local strout = ssub(strdata,i,val-1)
    return strout,val
end
stepIgnore(ReadString)

---@param strdata string
---@param i number
---@return SourceBreakpoint breakpoint
---@return number nextIndex
local function ReadSourceBreakpoint(strdata,i)
    ---@type SourceBreakpoint
    local bp = {}

    bp.line,i = ReadVarInt(strdata,i)
    local mask = sbyte(strdata,i)
    i = i + 1

    -- 0x18 reseved in mask to prevent creating reserved bytes 10/13/26
    if band(mask,0x01) ~= 0 then
        bp.condition,i = ReadString(strdata,i)
    end
    if band(mask,0x02) ~= 0 then
        bp.hitCondition,i = ReadString(strdata,i)
    end
    if band(mask,0x04) ~= 0 then
        bp.logMessage,i = ReadString(strdata,i)
    end

    return bp,i
end
stepIgnore(ReadSourceBreakpoint)

---@param strdata string
---@return string filename
---@return SourceBreakpoint[] breakpoints
local function ReadBreakpoints(strdata)
    local i = 1
    local bytecount = #strdata
    local val

    if bytecount == 0 then return nil end
    local filename
    filename,i = ReadString(strdata,i)

    ---@type SourceBreakpoint[]
    local bps = {}

    val,i = sbyte(strdata,i),i+1
    if val == 0xfc then val = 13 end
    if val == 0xfd then val = 26 end
    if val == 0xfe then val = 10 end
    if val ~= 0xff then
        for j = 1,val,1 do
            val,i = ReadVarInt(strdata,i)
            ---@type SourceBreakpoint
            bps[#bps+1] = { line = val }
        end
    end

    val,i = sbyte(strdata,i),i+1
    if val == 0xfc then val = 13 end
    if val == 0xfd then val = 26 end
    if val == 0xfe then val = 10 end
    if val ~= 0xff then
        for j = 1,val,1 do
            local bp
            bp,i = ReadSourceBreakpoint(strdata,i)
            bps[#bps+1] = bp
        end
    end

    return filename,bps
end
stepIgnore(ReadBreakpoints)

return {
    ReadVarInt = ReadVarInt,
    WriteVarInt = WriteVarInt,
    ReadString = ReadString,
    ReadSourceBreakpoint = ReadSourceBreakpoint,
    ReadBreakpoints = ReadBreakpoints,
}
