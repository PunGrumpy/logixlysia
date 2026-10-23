---
'logixlysia': patch
---

Response-phase enrichers now see every `set-cookie` the client gets. When a handler returns a `Response` with cookies and also sets one in `set.headers`, Elysia sends both, but enrichers saw only the `Response`'s cookies, and only the last one when there were several. `headers['set-cookie']` is now a string for one cookie and an array for several.
