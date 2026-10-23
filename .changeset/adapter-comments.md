---
'logixlysia': patch
---

The adapter docs now say what `flushIntervalMs`, `maxBatchSize` and the OTLP adapter's `headers` actually do: a batch that is due while a request is in flight goes out as soon as that request returns, and the OTLP headers come from `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, or from `OTEL_EXPORTER_OTLP_HEADERS` only when the first is unset. Internally, the adapters share one URL parser and no longer need comment-only `catch` blocks. No behavior change.
