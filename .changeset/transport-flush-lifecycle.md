---
'logixlysia': minor
---

Transports may now implement optional `flush()` and `close()`. The plugin flushes every transport and the file sink when the Elysia app stops, bounded by the new `config.flushTimeoutMs` (default 5000 ms; `0` disables waiting). A timeout is reported through `config.onError` with `sink: 'shutdown'`. `flushLogixlysia(options)` is exported for callers who need to drain (and optionally close) sinks outside the Elysia lifecycle.
