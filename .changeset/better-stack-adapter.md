---
'logixlysia': minor
---

Add the `logixlysia/better-stack` adapter. `createBetterStackTransport()` ships logs to Better Stack Telemetry using `BETTER_STACK_SOURCE_TOKEN`, supporting both the legacy shared endpoint and the dedicated per-source ingesting hosts (`BETTER_STACK_INGESTING_HOST`). Logs post with a `dt` timestamp, `level`, `message`, and the full meta object.
