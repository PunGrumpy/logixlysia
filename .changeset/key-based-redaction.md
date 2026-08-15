---
'createElogs': minor
---

`autoRedact` now redacts by sensitive key/header names (authorization, cookie, x-api-key, password, secret, token, session, …) in addition to value patterns; new `config.redactKeys` extends the list, and pino gets matching `redact.paths` defaults.
