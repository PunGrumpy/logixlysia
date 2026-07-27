---
'logixlysia': patch
---

Transport meta now carries a JSON-serializable `durationMs` number instead of a BigInt `beforeTime` (which made `JSON.stringify` throw in every serializing transport), and transport failures are reported to stderr (rate-limited) instead of being silently swallowed.
