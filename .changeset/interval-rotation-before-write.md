---
'logixlysia': patch
---

With `logRotation.interval`, a write after the interval elapsed was appended before the file was archived, so the whole batch landed in the previous period. The interval is now checked before the write, and that batch starts the new file. An empty file whose interval has already elapsed is still not archived, and its period now starts at that first write instead of archiving the line on its own. Time-based `maxFiles` counts an uncompressed archive's age from its last write, so a file that sat idle for longer than `maxFiles` is deleted when `interval` rotates it; before, the write that triggered the rotation made it look new. `maxSize` rotation is unchanged.
