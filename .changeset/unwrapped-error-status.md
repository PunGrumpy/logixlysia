---
'logixlysia': patch
---

With `aot: false`, an error that a later `onError` hook maps to another status (for example 418 with a body) now logs that status and level, the same as the `aot: true` path. Before, the line carried the thrown error's own status, usually 500.
