---
'logixlysia': minor
---

The error line now carries `error.cause` for an error thrown with `{ cause }`, normalized the same way as the error itself and cut at three levels. `HttpError` accepts `cause` in its init object; like `internal`, it is logged and never serialized into the response.
