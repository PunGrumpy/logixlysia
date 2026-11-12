---
'logixlysia': minor
---

Each line in the `logFilePath` file now starts with a full ISO 8601 UTC timestamp and carries the response status, as the file logging docs describe. A line reads `2025-04-13T15:00:19.225Z INFO GET /api/users 200 123.45ms message {"context":"json"}`, where it was `INFO 123.45ms GET /api/users message`. A line you write with `log.info()` shows `-` for the status, and its context is written after the message. The layout of the file changed, so update any script that parses it.
