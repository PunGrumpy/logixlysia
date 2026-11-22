---
'logixlysia': patch
---

With `logRotation.interval`, a write after the interval elapsed was appended before the file was archived, so the whole batch landed in the previous period. The interval is now checked before the write, and that batch starts the new file. An empty regular file is still not archived; when its interval has already elapsed it is replaced and the period starts at that write. A `maxSize` limit can still archive that first line before the next one. An uncompressed archive is dated when it is rotated, so time-based `maxFiles` does not delete it in that same pass when the live file had been idle longer than the window. A compressed archive is dated when the compressed file is written. `maxSize` rotation is otherwise unchanged.
