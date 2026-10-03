---
'logixlysia': patch
---

WebSocket logging tracks each connection by Elysia's underlying socket (`ws.raw`) instead of the wrapper Elysia creates for every event. Message and close lines report the time since the connection opened instead of about 0 ms, context merged with `mergeContext(ws, …)` in one event is still there in the next, and the connection's state is released on close. `wrapWs` throws a `TypeError` when its first argument is not the route path.
