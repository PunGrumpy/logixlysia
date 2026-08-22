---
'logixlysia': minor
---

Add `config.enrichers` and the `logixlysia/enrichers` subpath. An enricher contributes fields to the request context once and they reach every sink at once — console tree, file logs, and all transports. Four are built in: `traceparentEnricher()` parses the W3C `traceparent` header directly, with no OpenTelemetry SDK required, so logs link to traces in Sentry, HyperDX, or any OTLP backend; `userAgentEnricher()` adds browser, OS, device, and bot fields; `geoEnricher()` reads the geo headers Vercel, Cloudflare, and Netlify already attach; `sizeEnricher()` records `requestBytes` and `responseBytes`. Custom enrichers are a bare function (request phase) or an object with `request` and `response` phases. A hook that throws is reported via `onError` with the new `sink: 'enricher'` and skipped, never failing the request.
