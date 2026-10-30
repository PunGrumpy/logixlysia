---
'logixlysia': patch
---

Relative and absolute spellings of the same `logFilePath` now share one file sink, so rotation by one can no longer strand the other. After a failed size rotation the sink waits for another `maxSize` of writes before trying again, instead of retrying and reporting the error on every batch.
