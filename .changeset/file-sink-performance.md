---
'logixlysia': patch
---

File sink now holds an open file handle, batches same-tick lines into single writes, creates the log directory once, and tracks file size in memory — removing the per-line mkdir/open/stat syscalls. Rotation behavior is unchanged.
