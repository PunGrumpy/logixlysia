---
'logixlysia': patch
---

`mergeAIMetrics(log, …)` and `mergeAIMetrics(store.logger, request, …)` now add to the same totals within a request. Before, each form kept its own, and the later call replaced the earlier one's `ai` fields: 5 and 7 input tokens were logged as `inputTokens: 7` with `calls: 1`. `aiMiddleware(log)` records through the first form, so a handler that used it and also reported another SDK through `store.logger` logged too few tokens. Totals are kept per plugin instance: when an app forwards a request to another app that has its own `logixlysia()`, and both report through `store.logger`, the app that receives the request no longer has the forwarding app's usage added to its own.
