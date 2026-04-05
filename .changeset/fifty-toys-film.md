---
"logixlysia": patch
---

Fix a race condition in file and compression lock acquisition to ensure concurrent writes and rotations are serialized correctly.
