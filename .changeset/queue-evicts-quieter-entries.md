---
'logixlysia': patch
---

When an adapter's queue is full, a new entry that outranks the quietest waiting entry now takes the place of the oldest entry at that level, so an `ERROR` is not lost to a burst of `DEBUG` lines. `onDropped` still counts every dropped entry. `logixlysia/http` exports the `LogLevel` type.
