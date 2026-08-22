---
'logixlysia': minor
---

Add the `logixlysia/datadog` adapter. `createDatadogTransport()` ships logs to Datadog's v2 logs intake (`DD_API_KEY`, `DD_SITE` for regions). The log level lands in the `status` attribute for Datadog's default remapper, the HTTP response status follows the standard `http.status_code` attribute, and the full meta object rides along as searchable attributes.
