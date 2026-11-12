---
'logixlysia': patch
---

With `autoRedact` on, which `preset: 'prod'` turns on, each log line costs less CPU. Request headers are redacted only when the log format prints one (the `{ip}` token). The built-in patterns skip text that cannot contain a match. What gets redacted is unchanged.
