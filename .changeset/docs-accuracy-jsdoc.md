---
'logixlysia': patch
---

Correct the `useAsyncLocalStorage` documentation: the request-scoped `log` is always available on the handler context. The option only makes `useLogger()` return the current request's logger from anywhere in the request.
