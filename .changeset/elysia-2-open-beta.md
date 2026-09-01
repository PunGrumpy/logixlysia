---
"logixlysia": major
---

Target the Elysia 2 open beta (`>= 2.0.0-beta.11`).

Elysia 2 renamed every lifecycle method and left no aliases behind, so this release drops support for
Elysia 1.4 — the 6.x line stays on the `latest` tag for that.

- Register `setup`/`request`/`afterHandle`/`error` instead of `onStart`/`onRequest`/`onAfterHandle`/`onError`,
  and read the handler result from `context.responseValue` (the deprecated `context.response` was removed).
- Promote the plugin with `.as('plugin')` instead of `.as('scoped')`.
- `Logixlysia` now resolves to `Elysia<'', 'local', LogixlysiaSingleton>`; Elysia 2 inserts `Scope` as the
  second type parameter, and `LogixlysiaSingleton` drops the `resolve` slot that Elysia 2 removed from
  `SingletonBase` (`derive` now runs during `beforeHandle`, so `ctx.log` is no longer visible in
  `parse`/`transform`).
- `plugin.wrapWs` follows the new WebSocket handler contract: the route context is merged into the socket
  itself, so `ws.data.store.logger` reads as `ws.store.logger`, and `close` handlers receive
  `(ws, code, reason)`.
- Peer dependencies are now `elysia >= 2.0.0-beta.11` and `typescript >= 5.7.0`.

The Logixlysia API is otherwise unchanged. Applications need to rename their own lifecycle hooks, move
route hooks/schema before the handler (`.get(path, hook, handler)`), and register `elysia/websocket`
before using `.ws()` with `plugin.wrapWs` — see the Elysia 2 support page in the docs.
