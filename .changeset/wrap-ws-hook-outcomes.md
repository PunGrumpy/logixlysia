---
'logixlysia': patch
---

A `wrapWs` hook that throws or rejects is now logged as an `ERROR` line that carries the error and no status, instead of an `INFO` line with status 200 and no error. An `open` or `message` hook that returns a generator is now logged when the generator finishes, with an `ERROR` line if it throws partway, instead of before it had sent anything. Any other returned value, a hand-written iterator included, reaches Elysia as it is and is logged when the hook returns, as before, and a `close` hook is still logged when it returns or its promise settles. A generator or a hand-written iterator sends the same frames with and without `wrapWs`, and a hook's error still reaches Elysia's `onError`.
