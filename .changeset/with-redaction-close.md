---
'logixlysia': patch
---

A transport wrapped with `withRedaction` dropped the wrapped transport's `close`, so closing logixlysia left its sockets and timers open. The wrapper now exposes `close`, which drains the queued records, closes the wrapped transport and drops later records.
