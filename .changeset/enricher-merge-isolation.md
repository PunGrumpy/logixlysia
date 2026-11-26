---
'logixlysia': patch
---

An enricher that returned fields which threw while being read, such as a getter that fails, was not caught. It stopped the enrichers after it from running. In the request phase the error became the response body. In the response phase it was reported as a `format` error. Reading and merging the returned fields now sits inside the same guard as the enricher call, so the error goes to `onError` with sink `enricher`, the request goes on, and the next enricher still runs.
