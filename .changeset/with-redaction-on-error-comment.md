---
'logixlysia': patch
---

The description of `withRedaction`'s `onError` option now says what it covers: load and redaction failures, a throw or rejection from the wrapped transport's `log()`, and a record dropped because the queue is full. A record logged after `close()` is reported through `onDropped` only, as before.
