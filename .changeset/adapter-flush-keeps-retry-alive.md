---
'logixlysia': patch
---

An awaited adapter `flush()` or `close()` now keeps the retry backoff timer alive, so a process whose only pending work is that call no longer exits in the middle of a retry and loses the batch. A background retry still lets the process exit. An error response body is now read to 1 KB at most instead of in full.
