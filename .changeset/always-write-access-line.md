---
'logixlysia': minor
---

A handler that calls `log.info`, `log.warn`, `log.debug` or `log.error` now gets its access line as well. Before, the custom line replaced the access line, so the request's status and full duration were logged nowhere, and the text line printed `200` even when the handler went on to return a 404.

The custom line is written before the response exists. It shows `-` where the status goes in the text and file formats, and has no `status` in the JSON line or in transport records. The access line follows with the real status, the full `durationMs`, the response-phase enricher fields and any AI usage merged during the request.

A request that logs once now writes two lines instead of one. To add fields to the access line without a second line, use `log.mergeContext`. To drop the access line, set `logFilter.accessLine`.
