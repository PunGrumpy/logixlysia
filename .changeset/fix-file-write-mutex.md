---
'logixlysia': patch
---

Fix the per-file write/compression mutex: locks are now registered synchronously, so concurrent same-tick writes to one log file no longer interleave with rotation (previously could drop or tear lines).
