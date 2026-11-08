---
'logixlysia': patch
---

A thrown or logged plain object is logged with its own fields and a `message`, instead of `[object Object]` and only its `code`, `why`, `fix`, `link` and `internal`. The console tree no longer prints `error  [object Object]` under a validation failure or a thrown string. A plain-object `cause` is normalized like the error itself, and the cause chain is cut at three levels.
