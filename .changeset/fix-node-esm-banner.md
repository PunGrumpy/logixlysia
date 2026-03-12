---
"logixlysia": patch
---

Fix startup banner JSON loading on Node.js by avoiding ESM `package.json` import and using `createRequire(import.meta.url)` instead.
