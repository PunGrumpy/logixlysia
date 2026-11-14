---
'logixlysia': minor
---

`logFilter` now takes `include` and `exclude` globs on the request pathname, so health checks, metrics and static assets can stay out of your logs, or only `/api/**` can be logged. A request that matches `exclude`, or misses a non-empty `include`, writes nothing: no access line, no `log.*` lines from its handler, no error line and no WebSocket lines for its path. `exclude` wins over `include`. The globs are the ones `sampling.tail.paths` already uses, they are compiled once at startup, and a value that is not an array of non-empty glob strings throws an error naming the key. An excluded request skips log assembly, redaction and enrichers, so it costs a fraction of a logged one.
