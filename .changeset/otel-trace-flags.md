---
'logixlysia': minor
---

`logixlysia/otel` now adds the active span's trace flags to the request context: `trace_flags`, the flags byte as two hex digits, and `trace_sampled`, next to `trace_id` and `span_id`. These are the fields `traceparentEnricher()` already adds. Before, `otelEnricher()` and `injectTraceContext` left them out, so an OTLP or HyperDX record for a span the SDK started never carried the native `flags` field.
