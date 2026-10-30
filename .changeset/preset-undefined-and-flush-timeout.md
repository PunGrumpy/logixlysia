---
'logixlysia': patch
---

A `preset` value was lost when the same `config` key was set to `undefined`, for example `autoRedact: env.REDACT ? true : undefined` under `preset: 'prod'`; the preset value now stays. A `flushTimeoutMs` above 2147483647 made the shutdown flush give up after a millisecond; it is now rejected at startup.
