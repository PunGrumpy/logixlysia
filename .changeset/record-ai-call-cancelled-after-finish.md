---
'logixlysia': patch
---

An AI stream that the client cancels after reading its finish chunk is recorded with its usage and finish reason, instead of leaving no trace. A cancel before the finish chunk still records nothing.
