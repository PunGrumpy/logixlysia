---
"logixlysia": minor
---

Add `logixlysia/desertant`: `withRedaction()` wraps a transport so every record passes through an injected PII redactor before delivery, masking free-text PII — names, addresses, phone numbers, national IDs — that the pattern-based `autoRedact` pass cannot match. `NeuralRedactorSource` accepts a redactor, promise, or loader; whether processing stays local depends on the selected source.

The redactor is injected rather than imported, so logixlysia gains no dependency. Redaction runs off the request path, preserves log order, and bounds its queue. Records that fail model loading or redaction are dropped and reported by default; the original record is forwarded only when `onFailure: 'forward'` is explicitly configured.
