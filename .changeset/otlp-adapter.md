---
'logixlysia': minor
---

Add the `logixlysia/otlp` adapter. `createOtlpTransport()` ships logs to any OTLP/HTTP logs endpoint as `ExportLogsServiceRequest` JSON — OpenTelemetry Collectors, Grafana Cloud, New Relic, Honeycomb, SigNoz, and other OTLP-compatible backends. Honors the standard `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `OTEL_SERVICE_NAME` variables.
