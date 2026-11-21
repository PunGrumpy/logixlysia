---
'logixlysia': patch
---

With `requestId` on, the id the plugin read or generated can no longer be replaced through the request's context, so a request's log lines and its response header carry the same id. Before, `log.mergeContext({ requestId })` or an enricher returning that field replaced it for the rest of the request, and on an app built with `aot: false` the replaced value was written to the response header unchecked, so a value with a line break made the request throw. A merged `requestId` is now ignored; use another key, such as `upstreamRequestId`, for another service's id. A `requestId` passed to a single log call still labels that one line.
