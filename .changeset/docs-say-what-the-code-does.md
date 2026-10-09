---
'logixlysia': patch
---

`LogFilter`, `LogixlysiaConfig`, `LogRotationConfig`, `SinkErrorContext` and `WebSocketLike` are exported from the package root as types, so a config object, a rotation config, an `onError` handler or a `wrapWs` hook can be typed without reaching into the package's internals. No runtime export changes.
