---
'logixlysia': patch
---

`mergeAIMetrics` now keeps a running total per request: token counts, `msToFinish` and `calls` are summed across calls, and `model`, `provider` and `finishReason` keep the last call's values. Before, each call replaced the previous one on the access line.
