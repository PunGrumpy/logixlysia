---
'logixlysia': minor
---

Add the `logixlysia/loki` adapter. `createLokiTransport()` pushes logs to Grafana Loki (self-hosted or Grafana Cloud with basic auth, multi-tenant via `X-Scope-OrgID`). Streams are labeled with low-cardinality `service_name` and `level`; the log line is the message and full meta as JSON, ready for LogQL's `| json`.
