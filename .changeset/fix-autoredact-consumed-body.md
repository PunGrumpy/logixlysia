---
"logixlysia": patch
---

Fix `autoRedact` crashing routes with a request body. `redactRequest` no longer re-attaches the original (possibly already-consumed) request stream to its logging-only clone, which avoids the `ReadableStream has already been used` error when a redacted URL/header/method coincides with a parsed body (#329).
