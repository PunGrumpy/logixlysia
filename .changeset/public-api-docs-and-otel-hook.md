---
'logixlysia': patch
---

`HttpError`'s documentation now ships in the type declarations, so editors show it on hover. It had been attached to an internal constant instead of the class.

`logixlysia/otel` no longer exports `__resetForTesting`. It reset an internal cache for the package's own tests, was marked `@internal`, and was never documented.
