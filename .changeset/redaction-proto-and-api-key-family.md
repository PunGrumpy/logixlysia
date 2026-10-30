---
'logixlysia': patch
---

`autoRedact` now masks keys ending in `api-key`, `access-key`, `private-key` or `signing-key` under any prefix (such as `x-goog-api-key` or `stripeApiKey`) and keys containing `authorization` or `jwt`; a logged object or merged context with an own `__proto__` key keeps it as a key instead of re-parenting the copy.
