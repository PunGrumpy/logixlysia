---
'logixlysia': patch
---

With the plugin mounted in more than one module, the routes of a later instance logged without the request id and without its enrichers' fields, sampled each line on its own instead of each request as a whole, and its tail rules could not rescue the handler's lines (the final line was still written). A later instance now opens its own request scope when its derive runs for a request, so its routes log like the first instance's routes. Instances in one request share one request id per header name, whatever the case of the name, so the response carries one id.
