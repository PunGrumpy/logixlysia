---
'logixlysia': patch
---

Per-request logging is faster: format tokens are computed only when present in the log format, colors/thresholds/service are resolved once per logger, URL parsing and duration sampling happen once per emission, internal context reads no longer clone, WebSocket synthetic requests are memoized per path, and `autoRedact` returns the original object untouched when nothing needs redacting.
