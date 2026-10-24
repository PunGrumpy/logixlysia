---
'logixlysia': patch
---

A failed log compression is reported once by the rotation manager, instead of being reported and then rethrown to a caller that swallowed it. No behavior change.
