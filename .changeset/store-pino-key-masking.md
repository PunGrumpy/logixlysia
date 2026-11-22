---
'logixlysia': patch
---

With `autoRedact` on and no `pino.redact` set, `store.pino` masked only the exact built-in key names and `redactKeys` entries, at the top level and one level down, so keys such as `accessToken`, `apiKey`, `x_api_key` and `Authorization`, or a nested `user.profile.password`, were written in clear text. The object passed as the first argument to a `store.pino` call, or to a call on a child logger, is now also masked by the same key rule as the plugin's own lines, at any depth, wherever it is plain data. What the walk does not look inside stays on pino's path redaction as before: class instances, errors, objects with a getter or a `toJSON`, an array passed as the first argument, top-level keys that have a pino serializer, child bindings, `pino.base` and `mixin` fields. Everything that was masked before is still masked, and a call with nothing to mask hands pino the same object.
