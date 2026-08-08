---
'logixlysia': minor
---

Harden log output: file-sink lines, client IPs, and context-tree values are sanitized (control characters escaped/stripped, lengths bounded); malformed inbound request IDs are replaced with generated ones; log files/dirs are created with `0600`/`0700` modes, configurable via `logFileMode`/`logDirMode` (existing files keep their mode).
