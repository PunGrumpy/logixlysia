---
'logixlysia': patch
---

The README did not say that on Elysia `2.0.0-rc.5` and later a WebSocket route needs Bun 1.4.4 or newer. On an older Bun the upgrade request answers 500 and the socket never opens, with or without Logixlysia. The README's Elysia 2 passage now says so.
