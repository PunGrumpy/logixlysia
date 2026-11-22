---
'logixlysia': patch
---

With `consoleFormat: 'json'`, a `message` in the data passed to `store.logger.log` that is not a string replaced the line's `message`, so the line carried an object or a number there. The line's `message` is now always a string: the data's `message` when it is a string, and empty otherwise.
