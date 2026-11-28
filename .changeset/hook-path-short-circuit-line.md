---
'logixlysia': patch
---

With `aot: false`, a request that a `resolve`, `derive` or `onRequest` hook answered is logged with the status the client received and without an error. Before, the line's message was the source text of Elysia's `status` helper, and a `Response` returned from `onRequest` was logged as `ERROR` with status `200` whatever its own status was.
