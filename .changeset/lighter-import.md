---
'logixlysia': patch
---

Importing the plugin is cheaper. It no longer loads `node:http` for the status reason phrases, and it loads `node:zlib` only when a rotated log file is compressed. Measured on the built package after Elysia is loaded: 30.5 ms to 18.6 ms under Bun, 27.4 ms to 13.2 ms under Node.
