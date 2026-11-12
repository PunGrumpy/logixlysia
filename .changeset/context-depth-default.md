---
'logixlysia': minor
---

Make the console context tree easier to scan.

- `contextDepth` now defaults to `2`, so a nested object prints its fields as `user.id  usr_123` rows in place of one JSON blob. Set `contextDepth: 1` to get the old output.
- On a TTY, a context string longer than 200 characters is cut to 200 and ends in `… (<length> chars)`. Piped stdout, files and transports still get the whole string.
