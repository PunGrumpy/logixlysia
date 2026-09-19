---
'logixlysia': patch
---

`autoRedact` now masks query-string values whose parameter name is sensitive (`token`, `password`, `api_key`, and any `redactKeys` entry), preserves `error.cause` and other non-enumerable error fields instead of dropping them, no longer mistakes dotted version numbers like `120.0.0.0` for IP addresses, and masks IPv6 addresses. Console output sanitizes the message, the raw-URL fallback, and error entries the same way the file sink already does. The Sentry adapter no longer echoes the DSN in its configuration error. The geo enricher bounds header-derived values.
