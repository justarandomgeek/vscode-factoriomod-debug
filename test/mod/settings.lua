data:extend({
  {
    type = "string-setting",
    name = "dap-test-id",
    setting_type = "startup",
    default_value = "",
    allow_blank = true
  }
})

-- a string with lots of weird characters to make sure passing bytecode dumps works correctly
-- if this doesn't go correctly, the breakpoint-in-settings test will fail
local foo = "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f\x80\xef\xff"