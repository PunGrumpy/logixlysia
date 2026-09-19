# Plan 030: Forward the WebSocket close code and reason, and make `wrapWs` exception-safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5522d31..HEAD -- packages/logixlysia/src/websocket/wrap-ws.ts packages/logixlysia/__tests__/websocket/wrap-ws.test.ts apps/docs/content/features/websocket.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5522d31`, 2026-09-19

## Why this matters

Elysia calls a WebSocket route's `close` hook as `close(ws, code, reason)`. The `wrapWs` wrapper forwards only `ws`, so any app whose close handler branches on the close code (normal close vs `1006` abnormal vs policy violation) silently loses those arguments the moment it wraps the route. The close code is also missing from the "WebSocket closed" log line, which is the one detail you want when debugging dropped connections.

The wrapper also calls the user's hook before it logs and before it clears the connection's context bag, with no `try/finally`. A throwing hook therefore skips the lifecycle log and leaks the bag for the life of the process. Finally, `payloadType: typeof message` reports `'object'` for `Buffer`, `ArrayBuffer` and parsed JSON alike, so binary frames are indistinguishable.

## Current state

- `packages/logixlysia/src/websocket/wrap-ws.ts` (97 lines) — the wrapper.
- `packages/logixlysia/__tests__/websocket/wrap-ws.test.ts` — one test (`'logs WebSocket open and close through transports'`) that calls `hooks.close(ws)` with no code/reason and no-op hooks.
- `apps/docs/content/features/websocket.mdx` — documents `wrapWs`; its example uses `ws.data.store.logger`.
- `node_modules/elysia/dist/ws/index.js:38` — Elysia invokes `ws.data.close?.(ws, code, reason)`.

Types and wrapper today (`wrap-ws.ts:9–16, 63–96`):

```ts
export interface WsHandlerHooks<
  TMessage = unknown,
  TWs extends WebSocketLike = WebSocketLike
> {
  close?: (ws: TWs) => void
  message?: (ws: TWs, message: TMessage) => void
  open?: (ws: TWs) => void
}
...
  return <
    TMessage,
    TWs extends WebSocketLike,
    const THooks extends WsHandlerHooks<TMessage, TWs>
  >(
    path: string,
    hooks: THooks
  ): THooks =>
    ({
      ...hooks,
      close(ws) {
        hooks.close?.(ws)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket closed')
        }
        contextStore.clearContext(ws as object)
        wsTimings.delete(ws as object)
      },
      message(ws, message) {
        hooks.message?.(ws, message)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket message', {
            payloadType: typeof message
          })
        }
      },
      open(ws) {
        wsTimings.set(ws as object, process.hrtime.bigint())
        hooks.open?.(ws)
        if (options.config?.disableWebSocketLogging !== true) {
          logWs('INFO', ws, path, 'WebSocket opened')
        }
      }
    }) as THooks
```

`logWs(level, ws, path, message, extra?)` (`wrap-ws.ts:38–61`) merges `extra` into the logged context alongside `wsId`.

Conventions: Biome via `ultracite` (single quotes, no semicolons, sorted object keys). Tests use `bun:test` with a `mock()` transport and `createWsHandlerWrapper({}, logger, contextStore)`. Any change under `packages/logixlysia/` needs a changeset.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint / Format | `bun run lint` / `bun run format` | exit 0 |
| Tests | `cd packages/logixlysia && bun test __tests__/websocket` | all pass |
| Full | `cd packages/logixlysia && bun test` | all pass |

## Scope

**In scope**:
- `packages/logixlysia/src/websocket/wrap-ws.ts`
- `packages/logixlysia/__tests__/websocket/wrap-ws.test.ts`
- `packages/logixlysia/__tests__/plugin/ws-data-types.test.ts` (only if the widened `close` type breaks a type assertion there)
- `apps/docs/content/features/websocket.mdx` (one sentence: close hooks receive `code` and `reason`; the closed line logs them)
- `.changeset/wrap-ws-close.md`

**Out of scope**: `src/index.ts`, sampling, the synthetic-request cache in `wrap-ws.ts:20–29`.

## Git workflow

- Branch: `improve/030-wrap-ws-close` off `main`.
- Commits: `fix(websocket): forward close code and reason and log them`, `fix(websocket): always log and clean up even when a hook throws`, `fix(websocket): report binary frames as binary`.
- Changeset `.changeset/wrap-ws-close.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  `wrapWs` now forwards the close `code` and `reason` to your `close` hook and logs them on the "WebSocket closed" line; a hook that throws no longer skips the lifecycle log or leaks the connection's context; message logs report `payloadType: 'binary'` for `ArrayBuffer`/typed-array frames.
  ```

- Do NOT push or open a PR.

## Steps

### Step 1: Widen the hook types and forward the arguments

In `WsHandlerHooks`, change `close?: (ws: TWs) => void` to `close?: (ws: TWs, code?: number, reason?: string) => void`. In the wrapper, `close(ws, code, reason)` forwards both and logs `{ code, reason }` (omit keys that are `undefined`) in the `extra` bag.

**Verify**: `bun run typecheck` → exit 0. New test `'forwards close code and reason to the hook and logs them'`: `hooks.close(ws, 1001, 'going away')` → the hook mock receives `(ws, 1001, 'going away')` and the transport's closed record has `meta.context.code === 1001` and `meta.context.reason === 'going away'`.

### Step 2: `try/finally` around each user hook

Wrap the `hooks.open`, `hooks.message`, and `hooks.close` calls so that logging (when enabled) and, for `close`, the `clearContext` and `wsTimings.delete` cleanup run in `finally`. The error must still propagate to the caller (do not swallow it).

**Verify**: tests `'a throwing close hook still logs and clears the context'` (hook throws; `expect(() => hooks.close(ws)).toThrow()`; transport received the closed line; `contextStore.getContext(ws)` is `{}` after `mergeContext(ws, { a: 1 })` before close) and `'a throwing open hook still logs'`.

### Step 3: Binary payload type

Replace `payloadType: typeof message` with a helper `payloadTypeOf(message)` returning `'binary'` when `message instanceof ArrayBuffer || ArrayBuffer.isView(message)`, `'string'` for strings, and `typeof message` otherwise.

**Verify**: test `'reports binary frames as binary'` with `new Uint8Array([1, 2])` and `new ArrayBuffer(4)` → `payloadType === 'binary'`; a string → `'string'`; a parsed object → `'object'`.

### Step 4: Docs, changeset, format, gate

Add one sentence to `websocket.mdx` under the `wrapWs` section. Create the changeset. `bun run format && bun run lint && bun run typecheck && cd packages/logixlysia && bun test`.

## Test plan

Five new tests in `__tests__/websocket/wrap-ws.test.ts` as named above, modelled on the existing test's setup.

## Done criteria

- [ ] `grep -n "code?: number, reason?: string" packages/logixlysia/src/websocket/wrap-ws.ts` → match
- [ ] `grep -c "finally" packages/logixlysia/src/websocket/wrap-ws.ts` → ≥ 3
- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 5 new tests
- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `.changeset/wrap-ws-close.md` exists

## STOP conditions

- `wrap-ws.ts` no longer matches the excerpt.
- Widening `close`'s signature breaks `__tests__/plugin/ws-data-types.test.ts` in a way a matching type update cannot fix.
- Elysia's installed `ws/index.js` no longer calls `close(ws, code, reason)`.

## Maintenance notes

- The shared synthetic `Request` per path (`wsRequestCache`) is unchanged; it is a shared sampling key hazard if WS records ever get a sampling lifecycle.
