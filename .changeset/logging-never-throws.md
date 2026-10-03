---
'logixlysia': patch
---

Logging no longer fails a request. An error whose message is an object, such as `throw status(401, { error: 'unauthorized' })` in `onRequest`, no longer turns the response into a 500, and a BigInt or circular value in request context no longer crashes requests that print `{context}`. The Axiom, Better Stack, Datadog and Loki adapters write BigInts as strings and circular references as `"[Circular]"` instead of dropping the whole batch. Context-tree keys and structured error fields are sanitized like values. Any other failure while building a log record is reported to `onError` with the new `sink: 'format'`.
