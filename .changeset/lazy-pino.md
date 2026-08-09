---
'logixlysia': patch
---

pino is now constructed lazily on first access to `store.pino`/`logger.pino` (or eagerly when `config.pino` is set), instead of on every plugin instantiation. Dead internal helpers `formatLine`, `logWithPino`, and `renderContextTreeLines` were removed (they were never exported from the package).
