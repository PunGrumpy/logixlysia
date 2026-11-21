---
'logixlysia': patch
---

A `wrapWs` hook that throws or rejects is now logged as an `ERROR` line that carries the error and no status, instead of an `INFO` line with status 200 and no error. A hook that returns a generator is now logged when the generator finishes, with an `ERROR` line if it throws partway, instead of before it had sent anything. What the client receives and what reaches Elysia's `onError` are unchanged.
