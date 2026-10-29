---
'logixlysia': patch
---

`createLogger` now applies `preset` and validates its options, as the plugin does. It ignored the preset, so `createLogger({ preset: 'prod' })` shipped records without `autoRedact`, and an unknown preset was accepted.

A custom log that head sampling drops no longer takes the request's access line with it. The access line was suppressed as soon as the custom log passed `logFilter`, so with `sampling.head: { INFO: 0 }` a handler that called `log.info()` and returned a 503 logged nothing at all. A custom log now replaces the access line only when it is written, or when the tail verdict replays it.
