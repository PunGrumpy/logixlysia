---
'logixlysia': patch
---

`withRedaction` no longer waits for the wrapped transport to send its batch before redacting the next record, so wrapping a batching adapter no longer caps throughput at one batch per round trip and no longer drops records as "queue full" during a slow send. `flush()` and `close()` still wait for every delivery that was handed over.
