---
'logixlysia': patch
---

`logger.pino` writes messages under pino's default `msg` and `err` keys again when `messageKey` or `errorKey` is not set, instead of an `"undefined"` key.
