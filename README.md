
-- TODO: write a proper readme

It is on you to detect that the `help` flag has been set and then (probably) print `get_help_string`.\
You can modify the help option using the `help_option` field in the return value of the file.

Register more types converters using the `register_type` function.\
There are already type converters registered for `"string"`, `"number"` and `"boolean"`.

Finally use `parse` to parse a string array using a given config.

It can be used to only parse a part of the string array.\
To tell it where to start parsing in the array provide the start_index (third param).\
To know where it stopped parsing use the second return value.\
Both of these indexes are one based including including.

Here is a config i used during development:
```lua
local result = parse(arg, {
  options = {
    {
      field = "option", -- results in a boolean, true or false, set or not set
      long = "option",
      short = "o",
      description = "my option",
      flag = true,
    },
    {
      field = "foo", -- results in an array with 1 or 2 numbers
      long = "foo",
      short = "f",
      min_params = 1,
      max_params = 2,
      type = "number",
    },
    {
      field = "bar", -- results in a single value, a string
      short = "b",
      single_param = true,
      type = "string",
    },
    {
      field = "baz", -- results in an array with 3 strings
      long = "baz",
      params = 3,
      type = "string",
      optional = true,
    },
  },
  positional = {
    {
      name = "yes",
      field = "yes", -- results in a boolean value
      description = "a bool, yes",
      type = "boolean", -- the first arg that is not consumed by options must be a bool
      single = true, -- and it must be provided
      default_value = false, -- and if not provided it's not an error, it's just false
    },
    {
      name = "files",
      field = "files",
      type = "string",
      min_amount = 0,  -- all other positional args
    }
  },
})
```
