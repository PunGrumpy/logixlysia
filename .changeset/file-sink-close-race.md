---
'logixlysia': patch
---

A log line written while `flushLogixlysia(options, { close: true })` was running could reopen the log file while its sink was still registered, and the close then stopped tracking that sink, so later closes by the plugin could no longer reach the reopened file descriptor. Such a line now keeps its sink registered, and the next close releases the descriptor.
