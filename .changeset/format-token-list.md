---
'logixlysia': patch
---

The access-log format tokens are defined in one list that both the matcher and the token table are derived from, so a token cannot be added to one without the other. The response headers handed to enrichers are merged only when a response-phase enricher is registered. No behavior change.
