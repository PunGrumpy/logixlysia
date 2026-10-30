---
'logixlysia': minor
---

The OTLP and HyperDX adapters now set the log record's native `traceId`, `spanId` and `flags` from `context.trace_id`, `context.span_id` and `context.trace_flags`, so backends join logs to their traces; the attributes are kept too. `logixlysia/otel` gains `otelEnricher()`, so active-span ids can be attached through `config.enrichers` instead of a hand-written `onRequest` hook.
