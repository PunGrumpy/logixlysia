---
"createElogs": major
---

Target the Elysia 2 open beta (`>= 2.0.0-beta.2`).

Elysia 2 renamed every lifecycle method and left no aliases behind, so this release drops support for
Elysia 1.4 — the 6.x line stays on the `latest` tag for that.

- Register `setup`/`request`/`afterHandle`/`error` instead of `onStart`/`onRequest`/`onAfterHandle`/`onError`.
- Promote the plugin with `.as('plugin')` instead of `.as('scoped')`.
- `Elogs` now resolves to `Elysia<'', 'local', ElogsSingleton>`; Elysia 2 inserts `Scope` as the
  second type parameter, and `ElogsSingleton` drops the `resolve` slot that Elysia 2 removed from
  `SingletonBase`.
- Peer dependencies are now `elysia >= 2.0.0-beta.2` and `typescript >= 5.7.0`.

The Elogs API is otherwise unchanged. Applications need to rename their own lifecycle hooks and register
`elysia/websocket` before using `.ws()` with `plugin.wrapWs` — see the Elysia 2 support page in the docs.
