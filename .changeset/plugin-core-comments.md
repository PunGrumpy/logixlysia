---
'logixlysia': patch
---

Internal cleanup in the plugin core: comments that restated the code are gone, one helper now applies the level filter on every log path, and `requestId.header` is validated through the same normalisation the middleware applies. No behavior or API change.
