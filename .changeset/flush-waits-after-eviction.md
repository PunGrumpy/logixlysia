---
'logixlysia': patch
---

`flush()` on an adapter waits for every entry queued before it was called, even when louder entries evicted quieter ones from a full queue while it was pending.
