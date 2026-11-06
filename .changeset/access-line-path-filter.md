---
'logixlysia': minor
---

`logFilter.accessLine` hides the access line for paths matching `exclude` or not matching `include`, so health checks and metrics scrapes stop writing a line per probe. Responses at 400 or above, thrown errors and a handler's own log lines are never hidden.
