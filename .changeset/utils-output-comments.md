---
'logixlysia': patch
---

Internal cleanup in the redaction, file output and sampling modules: comments that restated the code are gone, and the ones that stay now match it (the file sink never promised an fsync, and the control-character check never matched tab or LF). No behavior change.
