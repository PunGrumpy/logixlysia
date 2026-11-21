---
'logixlysia': minor
---

`aiMiddleware` records `cacheReadTokens` and `cacheWriteTokens` when the provider reports input tokens read from or written to its prompt cache. Both fields are part of `inputTokens`, not extra tokens on top of it. They add up across the calls of a request, `mergeAIMetrics` accepts them, and a provider that reports none leaves the line as it was.
