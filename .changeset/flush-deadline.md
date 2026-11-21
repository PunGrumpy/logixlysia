---
'logixlysia': minor
---

`flushLogixlysia(options, { close: true, timeoutMs })` now waits at most `timeoutMs` for the flush and the close together, then resolves and reports the deadline through `onError` with `sink: 'shutdown'`. Every adapter's `flush()` and `close()` accept `{ signal }`: when it aborts, `flush()` resolves and leaves the request in flight to finish, and `close()` aborts the request, ends a wait before a retry, drops what is still buffered, reports all of it in one `onDropped({ count, reason: 'closed' })` and rejects. `withRedaction` passes the signal on to the transport it wraps.

Without opting in, a send that nobody awaits, such as one started by a full batch or by the interval timer, no longer holds the process open while it waits to retry, and the stop hook's `flushTimeoutMs` now reaches the transports, so the retries it started stop holding the process once it stops waiting.

`flushLogixlysia(options)` without `timeoutMs` waits as long as delivery takes, as before, and calls each transport's `flush()` and `close()` with no argument.
