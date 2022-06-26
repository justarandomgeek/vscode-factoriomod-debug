# Profiling

Setting `"hookMode": "profile"` in your launch config to enables profiling. This mode does not provide debug feaures (stepping, inspection, etc), but instead provides inline timing/hitcount data for every line and function executed in control stage. Flamegraph, higlighting and rulers are also provided to assist in finding hotspots. Mods may recognize the this mode by the presence of the global variable `__Profiler`.

The profiler also provides a remote inteface `profiler` with the following functions:

  * `dump()` - dump all timers immediately
  * `slow()` - return to slow-start mode (dumping on return from every event temporarily)
  * `save(name)` - return to slow-start mode and trigger an autosave with the given name. Defaults to "profiler" if unspecified.
