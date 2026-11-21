---
'logixlysia': patch
---

A record keeps its own level, timestamp and request when the data passed to `store.logger.log` has keys of those names. Before, with `consoleFormat: 'json'`, `{ level: 'DEBUG', timestamp: 'x' }` in the data printed a line with that level and that timestamp, and a `request` key replaced the record's `{ method, url }` on the JSON line and in what every transport received. The library's values now win; other keys in the data are logged as before.
