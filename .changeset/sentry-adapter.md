---
'logixlysia': minor
---

Add the `logixlysia/sentry` adapter. `createSentryTransport()` ships structured logs to Sentry (Explore > Logs) via the envelope endpoint using `SENTRY_DSN` — no Sentry SDK required. Every meta field becomes a typed, searchable attribute, and `trace_id` from the request context links logs to traces.
