---
'logixlysia': patch
---

`NeuralRedactorSource`'s documentation now says that a loader which fails is not retried, and that every later record is then handled as a redaction failure. No behavior change.
