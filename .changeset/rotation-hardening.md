---
'logixlysia': patch
---

Reject invalid log-rotation sizes (empty, negative, non-finite) and validate `logRotation`/`preset` config at plugin construction instead of failing silently per write.
