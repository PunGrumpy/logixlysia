---
'logixlysia': minor
---

`aiMiddleware(log)` from `logixlysia/ai` records AI SDK usage with one `wrapLanguageModel` line, streams included. A call that finishes after the request's line was written, as `toTextStreamResponse()` does, writes an `ai call finished` line, so its usage still reaches your sinks. `mergeAIMetrics` also accepts the handler's `log` directly: `mergeAIMetrics(log, metrics)`.
