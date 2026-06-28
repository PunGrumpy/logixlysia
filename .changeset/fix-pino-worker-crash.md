---
"logixlysia": patch
---

Fix thread-stream worker crash when using pino-pretty in Bun by initializing pretty print streams synchronously on the main thread.
