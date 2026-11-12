---
'logixlysia': minor
---

The JSON console line now carries the `service` option as a `service` key, placed after `level`. Before, `service` only reached the text line's `[name]` prefix, so records from several services could not be told apart once they were collected in one place. A record without a configured service is unchanged.
