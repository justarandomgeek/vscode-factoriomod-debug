U+FFFE/U+FFFF?

U+FDD0-U+FDEF to signal message types?

events w/ prompt
EF B7 90  FDD0  id-only
EF B7 91  FDD1  id+modname
EF B7 92  FDD2  exception

events w/o prompt
EF B7 94  FDD4  translation result
EF B7 95  FDD5  json event
EF B7 96  FDD6  json response

profile events
EF B7 A0  FDE0  profile line
EF B7 A1  FDE1  profile call
EF B7 A2  FDE2  profile tailcall
EF B7 A3  FDE3  profile return

EF B7 AE  FDEE  block start
EF B7 AF  FDEF  block end


PUA U+E000-U+F8FF also available for use?
