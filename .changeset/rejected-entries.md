---
'logixlysia': minor
---

The OTLP, HyperDX and Axiom adapters no longer count records as delivered when the backend answers with success but reports that it rejected some of them (an OTLP `partialSuccess`, or Axiom's `failed` count). `onDropped` now receives `{ count, reason: 'rejected' }` for those records, and the backend's explanation goes to `onError`. The batch is not retried and `flush()` still resolves.

`createHttpTransport` takes a new optional `rejected` function for other backends. It receives the parsed JSON body of a successful response and returns `{ count, detail? }` for the entries the backend did not store.
