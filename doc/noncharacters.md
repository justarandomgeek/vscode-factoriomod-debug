U+FFFE/U+FFFF?

U+FDD0-U+FDEF to signal message types?

stdout prefix:

events w/ prompt
EF B7 90  FDD0  simple message

events w/o prompt
EF B7 94  FDD4  translation result
EF B7 95  FDD5  json event
EF B7 96  FDD6  json response

profile events
EF B7 A0  FDE0  profile line
EF B7 A1  FDE1  profile call
EF B7 A2  FDE2  profile tailcall
EF B7 A3  FDE3  profile return

EF B7 AD  FDED  legacy profile dump

EF B7 AE  FDEE  block start
EF B7 AF  FDEF  block end

json reviver:
EF B7 90  FDD0  DA Basename?
EF B7 91  FDD1  DA Path
EF B7 92  FDD2  DA Line
EF B7 93  FDD3  (reserved for DA Column?)
EF B7 94  FDD4  translation result

PUA U+E000-U+F8FF also available for use?

after FDD0 as ID:
EE 80 80  E000  on_instrument_settings
EE 80 81  E001  on_instrument_data
EE 80 82  E002  on_instrument_control
	modname
EE 80 83  E003  on_da_control
EE 80 84  E004  object_info
EE 80 85  E005  getref
EE 80 86  E006  on_tick
EE 80 87  E007  on_data
EE 80 88  E008  on_parse
EE 80 89  E009  on_init
EE 80 8A  E00A  on_load
EE 80 8B  E00B  leaving/running
EE 80 8C  E00C  terminate
EE 80 8D  E00D  step
EE 80 8E  E00E  breakpoint
EE 80 8F  E00F  exception
	type\x01error