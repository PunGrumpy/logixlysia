---
'logixlysia': patch
---

Adapter `timeout` values above 2,147,483,647 ms (2^31 - 1) are now rejected at construction. Node clamps a longer timer to 1 ms, so such a timeout aborted every request on Node; Bun was unaffected. The Datadog transport doc now names the attributes the event reserves (`ddsource`, `message`, `service`, `status`, `timestamp`) and says that a numeric `meta.status` moves to `http.status_code`.
