---
"logixlysia": patch
---

Fix WebSocket `ws.data` type inference when using logixlysia (closes #220)

The `LogixlysiaStore` index signature caused the combined store type to become `Record<string, unknown>`, overwriting the WebSocket context's `ws.data` type. Removed the index signature so `ws.data` preserves its proper type in WebSocket handlers.
