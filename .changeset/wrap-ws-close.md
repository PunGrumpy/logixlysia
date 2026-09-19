---
'logixlysia': patch
---

`wrapWs` now forwards the close `code` and `reason` to your `close` hook and logs them on the "WebSocket closed" line; a hook that throws no longer skips the lifecycle log or leaks the connection's context; message logs report `payloadType: 'binary'` for `ArrayBuffer`/typed-array frames.
