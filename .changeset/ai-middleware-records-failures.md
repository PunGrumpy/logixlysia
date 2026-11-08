---
'logixlysia': minor
---

`aiMiddleware(log)` records a model call that fails: `ai.errors` counts them, `finishReason` is `error`, and the model, provider and duration are kept, whether the call rejected, its stream failed mid-way, or it ended without a finish. The error still reaches the caller unchanged. A failure after the request's line was written logs `ai call failed` at `WARNING`.
