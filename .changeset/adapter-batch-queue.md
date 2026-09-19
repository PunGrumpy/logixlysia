---
'logixlysia': patch
---

Built-in adapters now deliver batches in order (one in-flight send at a time), `flush()` waits for every batch queued before it, and timer-driven flush failures are reported through the transport's `onError` option instead of an unthrottled `console.error`. `postWithRetry` honors `Retry-After` on 429 (capped at 30 s) and releases successful response bodies.
