---
'logixlysia': patch
---

A `wrapWs` hook that throws or rejects is now logged as an `ERROR` line with no status, whose message names the hook and the error (`WebSocket message hook failed: boom`) and which carries the error in its `error` field, instead of an `INFO` line with status 200 and no error. An `open` or `message` hook that returns a generator is logged when its iteration ends, with an `ERROR` line if it throws partway, and a generator Elysia never finishes gets no line. A `close` hook is logged when it returns or its promise settles and does not wait on a generator it returns. Only a plain generator is wrapped: a hand-written iterator, a generator from another realm and a generator that carries properties of its own are returned unchanged and logged when the hook returns. What a hook returns is sent as it is without `wrapWs`, and a hook's error still reaches Elysia's `onError`.
