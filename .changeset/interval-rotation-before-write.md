---
'logixlysia': patch
---

With `logRotation.interval`, the first line written after an interval elapsed went into the file being archived, so each archive ended with one line from the next period, and after a restart the new process's first line was appended to the old file. The interval is now checked before a write, so that line starts the new file. `maxSize` rotation is unchanged.
