---
'logixlysia': patch
---

String `set.status` values (e.g. `'Not Found'`) now log their real status code and severity instead of `200 INFO`, and thrown 4xx errors log as WARNING (matching the success-path severity ladder) instead of always ERROR.
