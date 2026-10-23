---
'logixlysia': patch
---

`withRedaction`'s documentation now says which values it leaves alone: only strings inside plain objects, arrays and errors are redacted, down to `maxDepth` levels, and any other object, such as a `Date`, a `Map` or a class instance, is delivered as it is. No behavior change.
