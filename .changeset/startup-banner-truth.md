---
'logixlysia': patch
---

The startup banner now shows its `logixlysia vX.Y.Z` row from an installed package. The row was only ever printed when running from the repository's source, because the version was looked up one directory too high from the built file. Under an adapter that gives start hooks no server, such as `@elysiajs/node`, the message no longer shows `http://localhost:3000` or the `PORT` variable's port, which could differ from the port the app listens on; it is printed without a URL instead.
