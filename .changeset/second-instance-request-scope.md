---
'logixlysia': patch
---

With the plugin mounted in more than one module, the routes of a later instance logged without the request id and without its enrichers' fields, sampled each line on its own instead of each request as a whole, and never applied its tail rules, so a handler's lines were dropped instead of rescued. A later instance now opens its own request scope the first time it sees a request and reuses the request id already set on the response, so its routes log like the first instance's routes.
