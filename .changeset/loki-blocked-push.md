---
'logixlysia': patch
---

The built-in Loki transport now treats HTTP 260, Loki's default response when ingestion is blocked, as a failed push. It does not retry the batch and calls `onDropped` with the batch size and reason `send-failed`. Previously the batch counted as delivered even though Loki stored none of it.
