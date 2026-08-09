---
'logixlysia': minor
---

Internal log/error pipelines are unified: error-path logs now honor the same sink gates and console-method-by-level as success-path logs (a 4xx warning now prints via `console.warn` instead of `console.error`). New `config.onError` hook surfaces transport/file/rotation sink failures to your code.
