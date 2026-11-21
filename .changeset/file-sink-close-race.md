---
'logixlysia': patch
---

A log line written while `flushLogixlysia(options, { close: true })` was running reopened the log file on a sink the plugin no longer tracked, so its file descriptor stayed open until the process exited, even across another close. Such a line now goes to a sink that the next close releases. No line was lost before or after.
