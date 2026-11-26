---
'logixlysia': minor
---

The configured `service` name reached the text line and the JSON console line, but not the record handed to transports, so a record shipped through `logixlysia/http`, a custom transport or `createMemoryTransport()` could not say which app wrote it. Every record a transport receives now carries `service` in its `meta` when `service` is set, and it wins over a `service` key in the logged data. An adapter's own service option, such as Datadog's `service` or the OTLP `serviceName`, still names the service in that backend.
