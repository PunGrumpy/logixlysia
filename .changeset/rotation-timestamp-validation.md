---
'logixlysia': patch
---

A failed gzip during rotation no longer skips `maxFiles` cleanup and is reported once. `timestamp.translateTime` understands pino-pretty's `SYS:standard`, `SYS:<pattern>` and `UTC:<pattern>` forms on the console line. `resolveOptions` now rejects `slowThreshold` greater than `verySlowThreshold` and a numeric `logRotation.maxFiles` that is not a positive integer.
