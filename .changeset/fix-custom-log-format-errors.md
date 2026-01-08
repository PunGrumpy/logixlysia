---
"logixlysia": patch
---

Fix `customLogFormat` being ignored for error logs. Error logs now properly respect the `customLogFormat` configuration instead of using a hardcoded `console.error` format. Also adds missing `RequestInfo` type definition.