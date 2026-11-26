---
'logixlysia': patch
---

The Loki transport reports a push that Loki answers with `260`, its default status when an operator has blocked ingestion, as a failed batch: `flush()` rejects, `onDropped` gets the entries as `send-failed`, and the batch is not retried. Before, the batch counted as delivered although Loki stored none of it. `createHttpTransport` still treats every `2xx` as success.
