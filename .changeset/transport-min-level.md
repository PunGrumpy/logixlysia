---
'logixlysia': minor
---

A transport can set `minLevel` to receive only records at that level or louder, so you can send errors to Sentry and everything to Axiom without a wrapper. Every adapter accepts the option, and `withRedaction` keeps it.
