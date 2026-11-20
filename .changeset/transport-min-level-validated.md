---
'logixlysia': patch
---

A transport you write yourself is now checked for a valid `minLevel` when the plugin is created. Before, only the built-in adapters and `createHttpTransport` checked it, so `{ log, minLevel: 'error' }` in `config.transports` was accepted and then received every level. A `minLevel` that is not `DEBUG`, `INFO`, `WARNING` or `ERROR` now throws `logixlysia: invalid output config`.
