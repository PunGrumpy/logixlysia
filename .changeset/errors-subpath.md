---
'logixlysia': minor
---

`logixlysia/errors` exports `HttpError` and `isHttpErrorPayload` with no dependencies, so shared code and browser bundles can throw the error and parse its `why`, `fix` and `link` from a response. The root still exports both.
