---
"logixlysia": patch
---

Fix Node.js v25+ compatibility for startup banner (closes #231)

The banner extension imported `elysia/package.json` without the required import attribute, causing `ERR_IMPORT_ATTRIBUTE_MISSING` when running on Node.js. Added `with { type: "json" }` to the import so the package works on both Bun and Node.js.
