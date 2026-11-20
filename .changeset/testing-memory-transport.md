---
'logixlysia': minor
---

Add `logixlysia/testing`, with `createMemoryTransport` for asserting on logs in tests. It keeps the last `maxRecords` records (default 1000) as plain snapshots with `level`, `message`, `method`, `path`, `status`, `durationMs`, `requestId`, the merged `context` and the serialized `error`, including the `code`, `why` and `fix` of an `HttpError`. Records carry the redaction `autoRedact` applied. Read them with `records`, `find`, `filter`, `last` and `clear`, or `await waitFor(predicate)`, which rejects after `timeoutMs` with the records it saw.
