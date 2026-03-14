---
"logixlysia": patch
---

Fix `ERR_IMPORT_ATTRIBUTE_MISSING` error on Node.js by avoiding ESM `package.json` import and using `createRequire(import.meta.url)` for startup banner JSON loading instead.
