---
'logixlysia': patch
---

A `wrapWs` hook that throws or rejects is now logged as an `ERROR` line that carries the error and no status, instead of an `INFO` line with status 200 and no error. An `open` or `message` hook that returns a real generator is logged when its iteration ends, with an `ERROR` line if it throws partway, and a generator Elysia never finishes gets no line. A `close` hook is logged when it returns or its promise settles and does not wait on a generator it returns. Only a real generator is wrapped. A hand-written iterator and a generator from another realm are returned unchanged. A value, a promise or a wrapped generator reaches Elysia with the same result as without `wrapWs`, and a hook's error still reaches Elysia's `onError`.
