---
'logixlysia': patch
---

Transports now receive the request URL without its query string unless `logQueryParams` is `true`, the same rule the console and file sinks already follow. Before, query parameters such as OAuth codes and signed-URL tokens reached every adapter even with the option off.
