---
'logixlysia': patch
---

Access logs now report the status of a returned `Response`; a custom log that was filtered out no longer suppresses the access log; an error thrown after the handler produces one final line with the request's real duration and context; in-handler custom logs show the elapsed request time instead of `0ms`; `store.beforeTime` is populated per request; the AsyncLocalStorage logger is reset when a request ends.
