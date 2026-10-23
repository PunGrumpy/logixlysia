---
'logixlysia': patch
---

Response-phase enrichers now see the headers the client actually got. When a handler returns a `Response` and also sets the same header in `set.headers`, Elysia sends the `Response`'s value, but enrichers were handed the `set.headers` one, so `sizeEnricher` could log a `responseBytes` the client never saw. The `Response`'s header now wins, and `set.headers` still fills in any header the `Response` does not carry.
