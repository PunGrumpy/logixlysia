---
'logixlysia': patch
---

`wrapWs` no longer discards what a hook returns. A returned string, object, `Buffer`, promise or generator reaches Elysia and is sent to the client exactly as without the wrapper; a hook that returned a value by accident (for example `(ws, m) => ws.send(m)`, whose result is Bun's numeric send status) now has that value sent too, as Elysia does for an unwrapped hook. An `async` hook that rejects is handled by Elysia's error path instead of becoming an unhandled rejection, and its lifecycle line is written after the hook settles.
