---
'logixlysia': patch
---

The `requestId` and `generator` docs now state the validation rule (1-128 characters of `A-Z a-z 0-9 . _ -`) and the UUID fallback that applies when an inbound or generated ID fails it. `redactRequest`'s doc says the original request is returned when nothing needed redacting. `LogFields` is documented as the default field shape. No behavior change.
