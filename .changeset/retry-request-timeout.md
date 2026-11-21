---
'logixlysia': patch
---

The adapters and `createHttpTransport` now retry a `408 Request Timeout` response like a `429`, with the usual backoff. Before, a 408 ended the send without another attempt.
