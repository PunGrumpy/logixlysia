---
'logixlysia': major
---

Target the Elysia 2 beta (`>= 2.0.0-beta.19`).

Elysia 2 renamed every lifecycle method and kept no aliases, so this release drops support for Elysia 1.4. Elysia 1.4 users stay on the 6.x line from the `latest` tag.

- The plugin registers `setup`, `cleanup`, `request`, `afterHandle` and `error` instead of `onStart`, `onStop`, `onRequest`, `onAfterHandle` and `onError`. It reads the handler result from `context.responseValue`, because Elysia 2 removed `context.response`.
- The plugin promotes its hooks with `.as('plugin')` instead of `.as('scoped')`.
- `Logixlysia` is now `Elysia<'', 'local', LogixlysiaSingleton>`. Elysia 2 added `Scope` as the second type parameter and removed the `resolve` slot from `SingletonBase`, so `LogixlysiaSingleton` has no `resolve` slot either. `derive` now runs during `beforeHandle`, so `ctx.log` is not available in `parse` or `transform`.
- `plugin.wrapWs` reads `ws.store.logger` instead of `ws.data.store.logger`, because Elysia 2 merges the route context into the socket.
- Validation error logs read the TypeBox 1.x error shape. Failed paths come from `schemaPath`, and a missing field is listed by name from `params.requiredProperties`. The minification-safe check uses Elysia 2's `code: 'validation'`. With `logErrorPayload` on, the rejected value is logged as `error.value`, because Elysia 2 no longer puts it in the message.
- Peer dependencies are now `elysia >= 2.0.0-beta.19` and `typescript >= 5.7.0`.

The rest of the Logixlysia API is unchanged. In your app, rename your own lifecycle hooks, move route hooks and schema before the handler (`.get(path, hook, handler)`), and register `elysia/websocket` before using `.ws()` with `plugin.wrapWs`. The "Use Logixlysia with Elysia 2" docs page covers each step.
