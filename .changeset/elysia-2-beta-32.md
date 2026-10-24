---
'logixlysia': major
---

Target Elysia `>= 2.0.0-beta.32`, the current public beta, and bring the 6.10.x fixes to the `next` line.

- Elysia 2.0.0-beta.32 restored the `on*` lifecycle names, so the plugin registers `onStart`, `onStop`, `onRequest`, `onAfterHandle` and `onError` again and your app keeps those names too. `.as('scoped')` is still `.as('plugin')`, `onAfterHandle` still reads `responseValue`, route hooks still go before the handler, and `resolve` is gone.
- `status()` results are `ElysiaStatus` objects with a `status` field; the plugin reads that instead of `code`.
- A thrown error answers 500 even after `set.status` was set, as Elysia 2 does, and the log line says 500.
- Response-phase enrichers see a `set.headers['set-cookie']` array next to a returned `Response`'s own cookies, as Elysia 2 sends them.
- Streamed and `sse()` bodies are timed until they end under Elysia 2, which pulls an `sse()` generator only when the body is read. A body cancelled by the client is logged when the cancel arrives, including a cleanup that throws, which Elysia 2 otherwise swallows.
- Two plugin instances in one app keep their own transports. Elysia 2 deep-merges a deduplicated plugin's `store` into the first instance's, which routed the first instance's lines to the second's transports.
- The plugin registers no `onAfterResponse` hook any more. In Elysia 2.0.0-beta.32 any such hook makes Elysia tee generator responses and `sse()` loses its event-stream framing; the request wrap covers the exits that hook handled.
- The plugin object exposes `store` (`logger`, `pino`), because Elysia 2 instances no longer do. `logixlysia().store.pino` keeps working for code outside a request.
- Peer dependencies are `elysia >= 2.0.0-beta.32` and `typescript >= 5.7.0`. The playground uses `@elysia/openapi` 2.0.0-beta.6 and the tests `@elysia/node` 2.0.0-beta.3.
