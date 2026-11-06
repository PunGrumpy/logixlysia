---
'logixlysia': minor
---

`log.error(err)` accepts whatever you caught, so `catch (err) { log.error(err) }` compiles and logs the error. A non-string is serialized like a thrown error, with its name, `HttpError` fields and cause, instead of a blank message. The line carries no status, since the handler may recover.
