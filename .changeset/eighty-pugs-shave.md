---
"logixlysia": minor
---

Add `logixlysia/desertant`: `withRedaction()` wraps a transport so every record passes through an on-device PII model (such as `@desert-ant-labs/redact`) before delivery, masking free-text PII — names, addresses, phone numbers, national IDs — that the pattern-based `autoRedact` pass cannot match.

The model is injected rather than imported, so logixlysia gains no dependency. Redaction runs off the request path, preserves log order, bounds its queue, and fails closed: a record the model could not process is dropped and reported, never forwarded unredacted.
