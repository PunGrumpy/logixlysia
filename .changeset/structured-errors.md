---
'logixlysia': minor
---

`HttpError` now carries the context that makes a failure actionable: `code` (a stable identifier the client can branch on, unlike the message), `why`, `fix`, `link`, and `internal`. The first four appear in both the log and the response body; `internal` is log-only — it is non-enumerable and excluded from `toJSON()`, so no serializer can put it in a response. Error details also render in the console context tree for 4xx responses now, not just 5xx. Fully backward compatible: `new HttpError(404, 'Not found')` still responds with the bare message, and only an error carrying at least one client-facing field responds as JSON.
