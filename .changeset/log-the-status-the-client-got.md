---
'logixlysia': patch
---

A request answered with Elysia's `status()` helper is now logged with the status the client received, not 200 or 500. This covers a returned `status()`, a thrown one, and one returned from `beforeHandle`. The message is the string body, or the status text when the body is not a string. A returned `Response` keeps its own status over `set.status` unless it is 200, as in Elysia. Requests that reach neither `onAfterHandle` nor `onError` now get their log line instead of none. These are an auth `resolve` that returns `status(401)` and an error that an app-wide `onError` registered before the plugin answers.
