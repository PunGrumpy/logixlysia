---
'logixlysia': minor
---

The request-scoped logger is now generic over your field type: `logixlysia<CheckoutFields>()` types `log.mergeContext()` and the per-call `context` argument as `Partial<CheckoutFields>`, so TypeScript rejects a misspelled `user_id` before it splits your dashboard query in two. `useLogger<CheckoutFields>()` takes the same parameter for code outside the handler. Type-only with no runtime cost, and the default keeps every key allowed, so existing untyped code is unaffected.
