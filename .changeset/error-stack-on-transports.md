---
'logixlysia': patch
---

Error lines sent to transports now include `error.stack`, unless the error's own `status` is below 500.
