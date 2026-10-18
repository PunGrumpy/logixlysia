---
'logixlysia': patch
---

A `requestId.header` that is not a valid HTTP header name now throws when the plugin is created. Before, it made every request fail with `Invalid header name`. The HTTP adapters now also reject a `retries`, `timeout`, `flushIntervalMs` or `maxPendingBatches` that is not a usable number when they are created. Before, `maxPendingBatches: NaN` buffered without bound while the backend was down, `0` dropped almost every entry, and a `NaN` timeout failed every request.
