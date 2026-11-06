---
'logixlysia': minor
---

`logixlysia/http` exports `createHttpTransport`, so a backend without a built-in adapter gets the same batching, retries, bounded queue and `onDropped` by supplying a URL, headers and a request body.
