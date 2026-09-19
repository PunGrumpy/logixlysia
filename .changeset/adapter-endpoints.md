---
'logixlysia': patch
---

Built-in adapters no longer follow HTTP redirects on ingest requests, so a credential header cannot be forwarded to another origin; a redirect now fails the batch and is reported like any other transport error. Endpoint URLs from options or env vars are validated when the transport is created and must use `http:` or `https:`.
