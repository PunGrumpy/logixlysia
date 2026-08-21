---
'logixlysia': minor
---

Add the `logixlysia/hyperdx` adapter. `createHyperDXTransport()` ships logs to HyperDX (cloud or self-hosted collectors) as OTLP JSON over HTTP, authenticated with `HYPERDX_API_KEY`. Meta fields become dot-notation log attributes searchable in the HyperDX UI.
