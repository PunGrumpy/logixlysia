---
'logixlysia': patch
---

`withRedaction` now redacts a `DOMException`, such as the `TimeoutError` or `AbortError` that `AbortSignal.timeout()` and an aborted `fetch` reject with. Copying one threw `TypeError: Attempted to assign to readonly property.`, because its `name` and `message` are getter-only accessors on the prototype. The record was then dropped, or, with `onFailure: 'forward'`, shipped unredacted.
