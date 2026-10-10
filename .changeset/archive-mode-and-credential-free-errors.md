---
'logixlysia': patch
---

Compressed rotation archives are created with `logFileMode` (default `0o600`) instead of the process umask, so they are no more readable than the live log. An adapter's "invalid endpoint URL" error no longer echoes the credentials embedded in the URL, in its message or in its `cause`. File write and rotation failures reported on stderr (when `config.onError` is not set) are rate limited to one message every 5 seconds, like transport and formatting failures.
