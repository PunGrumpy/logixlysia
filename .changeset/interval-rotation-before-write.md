---
'logixlysia': patch
---

With `logRotation.interval`, a write after the interval elapsed was appended before the file was archived, so the whole batch landed in the previous period. The interval is now checked before the write, and that batch starts the new file. An empty file is still not archived; when its interval has already elapsed it is replaced, so the following write stays in the new period. Time-based `maxFiles` counts an archive from the moment it is rotated, including when the live file had not been written for longer than that. `maxSize` rotation is unchanged.
