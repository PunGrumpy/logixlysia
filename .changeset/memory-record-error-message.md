---
'logixlysia': patch
---

`createMemoryTransport()` from `logixlysia/testing` now keeps the promise its type makes: `record.error.message` is always a string. An error whose message is an object or a number gets it as JSON text, an error without a message gets `''`, and an error logged as a plain string becomes `{ message }` instead of being dropped. `record.meta.error` is still exactly what the transport received.
