# Plan 143: `wrapWs` logs a failed hook as an error and logs a generator hook when it finishes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. Skip any instruction to update `plans/README.md`: the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/websocket/wrap-ws.ts packages/logixlysia/src/logger/emit.ts packages/logixlysia/src/utils/error.ts packages/logixlysia/__tests__/websocket apps/docs/content/features/websocket.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition. (`emit.ts` and `error.ts` are only imported from, not edited; they are in the check because the plan relies on two of their exports.)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`plugin.wrapWs(path, hooks)` writes one line per WebSocket event: "WebSocket opened", "WebSocket message", "WebSocket closed". Today every one of those lines is `INFO` with status `200`, whatever the hook did. A hook that throws or rejects is logged as a success with no error in it, and the error only reaches Elysia's `onError`. A hook that returns a generator (the documented way to stream replies) is logged the moment it returns, before Elysia has pulled its first value, so the line says nothing about how the stream went and a throw halfway through is never logged at all.

Measured at `c019a4f` on Bun 1.3.14 with a real server and client, one transport printing each record (time since start, level, message, status, error):

```
--- generator that yields 'one', waits 200 ms, then throws
655ms INFO WebSocket message status=200 … err=null
655ms body start (fail)
859ms onError boom mid-stream            <- no log line records this
--- hook that throws synchronously
1269ms INFO WebSocket message status=200 … err=null
1269ms onError sync boom
--- async hook that rejects
1928ms INFO WebSocket message status=200 … err=null
1928ms onError async boom
```

After this plan, against the same probe (`status=undefined` is how the probe prints a record that has no `status` key):

```
675ms body start (fail)
877ms ERROR WebSocket message status=undefined … err={"message":"boom mid-stream","name":"Error","stack":"…"}
1284ms ERROR WebSocket message status=undefined … err={"message":"sync boom",…}
1947ms ERROR WebSocket message status=undefined … err={"message":"async boom",…}
--- generator that succeeds: the line now comes after "body end", not before "body start"
66ms body start (ok)
271ms body end
271ms INFO WebSocket message status=200 …
```

The client receives exactly what it received before (`["one","two"]`, `["one"]`, `[]`, `[]`), and Elysia's `onError` still sees all three errors.

This changes output users may rely on: a failed hook's line moves from `INFO` 200 to `ERROR` with no status, and a generator hook's line is written later. Both changes make the line say what happened; a log consumer that counted those lines as successes was counting failures.

## Current state

All source paths are relative to `packages/logixlysia/`.

### `src/websocket/wrap-ws.ts` (the only source file that changes)

Lines 47 to 74 decide when the line is written. Only a `Promise` is waited for; anything else, a generator included, gets `done()` at once:

```ts
const settleHook = async (
  pending: Promise<unknown>,
  done: () => void
): Promise<unknown> => {
  let value: unknown
  try {
    value = await pending
  } catch (error) {
    done()
    throw error
  }
  done()
  return value
}

/**
 * Hands the hook's result back to Elysia untouched, so a returned value is
 * sent, a generator is iterated and a rejection reaches Elysia's catch. The
 * lifecycle line is written once the result has settled. The `instanceof
 * Promise` test is the one Elysia itself uses (`ws/index.mjs:116`).
 */
const afterHook = (result: unknown, done: () => void): unknown => {
  if (result instanceof Promise) {
    return settleHook(result, done)
  }
  done()
  return result
}
```

Lines 86 to 106, `logWs`, write every line with `status: 200`. Its `level` parameter is always passed `'INFO'`:

```ts
const logWs = (
  level: 'INFO' | 'WARNING' | 'ERROR',
  ws: WebSocketLike,
  path: string,
  message: string,
  extra?: Record<string, unknown>
): void => {
  const request = wsSyntheticRequest(path)
  if (pathFilter?.excludes(request)) {
    return
  }
  const beforeTime = wsTimings.get(keyOf(ws)) ?? process.hrtime.bigint()
  const store: StoreData = { beforeTime }
  const accumulated = contextStore.peekContext(ws)
  const context =
    Object.keys(accumulated).length > 0 || extra
      ? { ...accumulated, ...extra, wsId: ws.id }
      : { wsId: ws.id }

  logger.log(level, request, { context, message, status: 200 }, store)
}
```

`beforeTime` is the connection's open time (set in `open` at line 171), so a line's `durationMs` is the connection's age. The docs call it that.

Lines 153 to 169, the `message` wrapper. A synchronous throw and a normal return call the same `done()`; `open` (lines 170 to 185) and `close` (lines 123 to 152) have the same shape. `close`'s `done` also clears the context and the timing:

```ts
      message(ws, message) {
        const done = (): void => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket message', {
              payloadType: payloadTypeOf(message)
            })
          }
        }
        let result: unknown
        try {
          result = hooks.message?.(ws, message)
        } catch (error) {
          done()
          throw error
        }
        return afterHook(result, done)
      },
```

```ts
contextStore.clearContext(ws)
wsTimings.delete(keyOf(ws))
```

`disableWebSocketLogging` is read only in these three `done` functions (`grep -n disableWebSocketLogging src/websocket/wrap-ws.ts` lists lines 125, 155, 173). It silences every WebSocket line. This plan keeps that: the new `ERROR` lines are silenced by it too.

### How the plugin's other error lines are built (reuse this, do not invent a shape)

`src/logger/handle-http-error.ts` lines 50 to 71 build the HTTP error line:

```ts
  try {
    const { error: safeError, message } = normalizeLoggedError(
      error,
      config?.logErrorPayload === true
    )

    const data: Record<string, unknown> = { error: safeError, message, status }

    emit({ … })
  } catch (failure) {
    reportFormatError(failure, config?.onError)
  }
```

`src/index.ts` lines 470 to 489, `log.error(error)` inside a handler, builds `{ context, error: normalized.error, message: normalized.message }` with no status (its doc comment, `src/types/logger.ts`: "it is written before the response exists and carries no status").

- `normalizeLoggedError(error, logErrorPayload)` is exported from `src/utils/error.ts` (line 168). For an `Error` it returns `{ error: { message, name, stack, … }, message }`. It can throw: an error whose `code` getter throws makes it throw (checked on Bun 1.3.14: `THROWS getter`). That is why both callers above wrap it.
- `reportFormatError(failure, onError)` is exported from `src/logger/emit.ts` (line 135). It calls `config.onError({ error, sink: 'format' })`, or rate-limits a `console.error` when there is no `onError`.

A record with no `status` key renders like this (measured with the prototype, `useColors: false`):

```
2026-11-21T19:38:21.231Z ERROR WS      /chat - 0.35ms WebSocket message
  ├─ payloadType  string
  ├─ wsId  ws-1
  ├─ error  sync boom
  └─ error.at  proto/console-shape.ts:10:57
{"timestamp":"…","level":"ERROR","message":"WebSocket message","request":{"method":"WS","url":"http://logixlysia.local/chat"},"durationMs":0.0395,"context":{"payloadType":"string","wsId":"ws-1"},"error":{"message":"sync boom","name":"Error","stack":"…"}}
```

and a transport's `meta` has no `status` key (`toRecordMeta` in `src/output/index.ts` spreads only the keys the data has).

### How Elysia handles a hook's result

Elysia 1.4.30 (`node_modules/elysia/dist/ws/index.mjs`, `createHandleWSResponse`, lines 114 to 136): a `Promise` is awaited and its value handled again; a value whose `next` is a function is an iterator: Elysia calls `next()` once, sends `first.value` (even when `first.done`), then runs `for (const datum of data)` or `for await (const datum of data)` depending on whether that first `next()` returned a promise. A throw or rejection anywhere in that reaches the `try`/`catch` around `handleResponse` in `node_modules/elysia/dist/adapter/bun/index.mjs` (lines 306 to 370), which calls the app's error handlers.

Elysia keeps pulling a `message` generator after the socket has closed (`ws.send` on a closed socket does not throw). Measured with the prototype: a generator that yields five values 40 ms apart, client closes after 60 ms: all five values are yielded and the "WebSocket message" line is written after the "WebSocket closed" line, three runs out of three.

Elysia 2 (`elysia@2.0.0-beta.32`, `dist/ws/route.mjs`, `handleWSResponse` and `ws/context.mjs` `isGeneratorObject`, read from the published tarball, not installed here) treats a value as an iterator with the same test this plan uses (`next` is a function and `Symbol.iterator` or `Symbol.asyncIterator` is a function), stops pulling when the socket is closed under backpressure, and calls `iter.return()` in a `finally`. The CI job "Test on Elysia next/rc" runs this repo's suite on Elysia 2; you cannot run it locally.

### Existing pattern in this repo

`src/index.ts` lines 123 to 129 has the same iterator test for HTTP bodies (`isGeneratorObject`), and lines 180 to 217 wrap a streamed body in an `async function*` that forwards to the source with `yield* { [Symbol.asyncIterator]: () => scoped }` and settles in `finally`. Do not import from or change `src/index.ts`; this plan writes a small local equivalent.

### Tests

`__tests__/websocket/` holds four files today. `wrap-ws.test.ts` calls the wrapper directly with a transport mock (model new unit tests on its `setup()`); `wrap-ws-results.test.ts` runs a real server and client and has a module-level `serve()`, `exchange()`, `recordsNamed()` and an `errors` array filled by `onError`. These existing tests must stay green unchanged. Three of them already touch this behaviour and keep passing because the line keeps its message:

- `wrap-ws.test.ts` `a throwing close hook still logs and clears the context` and `a throwing open hook still logs` (they check the message text is present).
- `wrap-ws-results.test.ts` `a synchronous throw still reaches Elysia and is still logged` (one "WebSocket message" record).

Conventions: `bun:test`, `const` arrow functions with explicit types, comments say why and never what, tests assert literal values. Lint is oxlint through ultracite; it rejects a declaration used before it is defined (`no-use-before-define`), a generator with no `yield` (`require-yield`), and `await` inside a loop. A rule is silenced in tests as `// oxlint-disable-next-line <rule> -- <reason>` (see `__tests__/plugin/final-line.test.ts:458`).

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `dist/` written; the API-snapshot test reads it |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| One area | `cd packages/logixlysia && bun test ./__tests__/websocket/` | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1249 tests in 100 files at `c019a4f`) |
| Docs typecheck | `cd apps/docs && bun run typecheck` | exit 0 |

`bun test` on a subset exits 1 even with no failure, because the coverage threshold covers the whole tree. Judge a subset by its `pass` and `fail` lines only. On a loaded machine, tests in `__tests__/logger/lazy-pino.test.ts`, `lazy-chalk.test.ts` and `bundled-app.test.ts` can time out at 5 s while starting a child process; that is a known load effect unrelated to this plan (they passed on an idle run and in CI). Rerun those files alone before treating them as a failure.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/websocket/wrap-ws.ts`
- `packages/logixlysia/__tests__/websocket/wrap-ws-failures.test.ts` (create)
- `packages/logixlysia/__tests__/websocket/wrap-ws-iterators.test.ts` (create)
- `packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts` (append two tests; change nothing else)
- `apps/docs/content/features/websocket.mdx` (lines 39 and 41 and one new paragraph)
- `.changeset/wrap-ws-hook-outcomes.md` (create)

**Out of scope** (do NOT touch):

- `src/index.ts`, including `wrapAsyncStream` and `isGeneratorObject`. The request path is not changing, and the `flushLogixlysia` and `onStop` parts of that file belong to another pull request.
- `src/logger/emit.ts`, `src/utils/error.ts`, `src/output/index.ts`: import from the first two, edit none. `src/output/index.ts` belongs to another pull request.
- `wrap-ws.test.ts`, `wrap-ws-server.test.ts`, `log-filter-paths.test.ts`, and the existing tests in `wrap-ws-results.test.ts`. They are the proof that a hook's result still reaches Elysia as before; if one fails, STOP.
- `apps/docs/content/configuration.mdx`: its `disableWebSocketLogging` sentence ("Turns off the open, message and close lines that `wrapWs` writes") stays true.
- Every docs page another pull request owns: `adapters/*.mdx`, `integrations/pino.mdx`, `integrations/desertant.mdx`, `integrations/ai.mdx`, `features/startup.mdx`, `features/request-context.mdx`, `features/filtering.mdx`, `features/enrichers.mdx`, `features/transports.mdx`, `faq.mdx`, `migration-from-evlog.mdx`.
- Any new option or package export. `HookFailure` and `Settle` stay private to `wrap-ws.ts`.
- The HTTP upgrade line's status, the `WebSocketLike` type, a `drain` hook. Recorded elsewhere.

## Git workflow

- Branch: `fix/wrap-ws-hook-outcomes`, cut from the base commit your task names.
- Four commits, in this order:
  1. `fix(websocket): log a WebSocket hook that throws or rejects as an error line` (`wrap-ws.ts`, `wrap-ws-failures.test.ts`, the first appended test in `wrap-ws-results.test.ts`)
  2. `fix(websocket): log a generator hook when its iteration ends` (`wrap-ws.ts`, `wrap-ws-iterators.test.ts`, the second appended test in `wrap-ws-results.test.ts`)
  3. `docs(websocket): say how failed and streaming hooks are logged`
  4. `chore(changeset): note the WebSocket error and generator lines`
- Each commit body is one to three short paragraphs of plain prose: what a user saw, what changed, what a reader would not guess from the diff (for commit 1, why the error line has no status; for commit 2, why the open time is no longer deleted on close and why the close keeps the cleared context).
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing tests for a throwing or rejecting hook

Create `packages/logixlysia/__tests__/websocket/wrap-ws-failures.test.ts` with exactly this content:

```ts
import { expect, mock, test } from 'bun:test'
import { createRequestContextStore } from '../../src/context/request-context'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'

type TransportMock = ReturnType<
  typeof mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>
>

interface LogRecord {
  context?: Record<string, unknown>
  error?: Record<string, unknown>
}

const setup = (config: NonNullable<Options['config']> = {}) => {
  const transport: TransportMock = mock(() => {})
  const contextStore = createRequestContextStore()
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }],
      ...config
    }
  }
  const logger = createLogger(options, undefined, contextStore)
  const wrapWs = createWsHandlerWrapper(options, logger, contextStore)
  return { contextStore, transport, wrapWs }
}

const levelsFrom = (transport: TransportMock): unknown[] =>
  transport.mock.calls.map(call => call[0])

const recordAt = (transport: TransportMock, index: number): LogRecord =>
  (transport.mock.calls[index]?.[2] as LogRecord | undefined) ?? {}

test('a message hook that throws writes one ERROR line carrying the error', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw new Error('sync boom')
    }
  })

  expect(() => hooks.message({ id: 'ws-1' }, 'hi')).toThrow('sync boom')

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(transport.mock.calls[0]?.[1]).toBe('WebSocket message')
  const record = recordAt(transport, 0)
  expect(record.error).toMatchObject({ message: 'sync boom', name: 'Error' })
  expect(record.context).toEqual({ payloadType: 'string', wsId: 'ws-1' })
  expect(record).not.toHaveProperty('status')
})

test('a message hook that rejects writes one ERROR line carrying the error', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async message(_ws, _message) {
      await Promise.resolve()
      throw new Error('async boom')
    }
  })

  await expect(hooks.message({ id: 'ws-1' }, 'hi')).rejects.toThrow(
    'async boom'
  )

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'async boom'
  })
  expect(recordAt(transport, 0)).not.toHaveProperty('status')
})

test('an open hook that throws writes an ERROR opened line', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    open(_ws) {
      throw new Error('no room')
    }
  })

  expect(() => hooks.open({ id: 'ws-1' })).toThrow('no room')

  expect(transport.mock.calls.map(call => [call[0], call[1]])).toEqual([
    ['ERROR', 'WebSocket opened']
  ])
  expect(recordAt(transport, 0).error).toMatchObject({ message: 'no room' })
})

test('a close hook that rejects writes an ERROR closed line and still clears the context', async () => {
  const { contextStore, transport, wrapWs } = setup()
  const ws = { id: 'ws-1' }
  const hooks = wrapWs('/chat', {
    async close(_ws, _code, _reason) {
      await Promise.resolve()
      throw new Error('cleanup failed')
    }
  })
  contextStore.mergeContext(ws, { room: 'lobby' })

  await expect(hooks.close(ws, 1001, 'going away')).rejects.toThrow(
    'cleanup failed'
  )

  expect(levelsFrom(transport)).toEqual(['ERROR'])
  expect(recordAt(transport, 0).context).toEqual({
    code: 1001,
    reason: 'going away',
    room: 'lobby',
    wsId: 'ws-1'
  })
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'cleanup failed'
  })
  expect(contextStore.getContext(ws)).toEqual({})
})

test('a successful hook keeps its INFO line with status 200', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      return 'ok'
    }
  })

  expect(hooks.message({ id: 'ws-1' }, 'hi')).toBe('ok')

  expect(levelsFrom(transport)).toEqual(['INFO'])
  expect(recordAt(transport, 0)).toMatchObject({ status: 200 })
  expect(recordAt(transport, 0)).not.toHaveProperty('error')
})

test('disableWebSocketLogging also silences a failed hook', () => {
  const { transport, wrapWs } = setup({ disableWebSocketLogging: true })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw new Error('quiet')
    }
  })

  expect(() => hooks.message({ id: 'ws-1' }, 'hi')).toThrow('quiet')

  expect(transport).not.toHaveBeenCalled()
})

test('the hook error still reaches the caller when it cannot be logged', () => {
  const onError = mock((_context: unknown) => {})
  const { transport, wrapWs } = setup({ onError })
  const failure = new Error('original')
  Object.defineProperty(failure, 'code', {
    get() {
      throw new Error('unreadable code')
    }
  })
  const hooks = wrapWs('/chat', {
    message(_ws, _message) {
      throw failure
    }
  })

  let caught: unknown
  try {
    hooks.message({ id: 'ws-1' }, 'hi')
  } catch (error) {
    caught = error
  }

  expect(caught).toBe(failure)
  expect(transport).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0]?.[0]).toMatchObject({ sink: 'format' })
})
```

Append this test to the end of `packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts` (it uses that file's existing `serve`, `exchange`, `recordsNamed`, `errors`, `sleep` and `waitFor`; add no imports):

```ts
test('a hook that rejects on a real socket writes one ERROR line with the error', async () => {
  const url = serve('/reject-logged', {
    async message() {
      await sleep(1)
      throw new Error('boom')
    }
  })

  await exchange(url, 'hi')
  await waitFor(() => recordsNamed('WebSocket message').length > 0)

  const lines = recordsNamed('WebSocket message')
  expect(lines.map(call => call[0])).toEqual(['ERROR'])
  expect(lines[0]?.[2]).toMatchObject({ error: { message: 'boom' } })
  expect(lines[0]?.[2]).not.toHaveProperty('status')
  expect(errors).toHaveLength(1)
})
```

**Verify**: `cd packages/logixlysia && bun test ./__tests__/websocket/wrap-ws-failures.test.ts` reports 2 pass and 5 fail. The two that pass before the fix are `a successful hook keeps its INFO line with status 200` and `disableWebSocketLogging also silences a failed hook`. The level tests fail with a diff of `-   "ERROR",` / `+   "INFO",`; `the hook error still reaches the caller when it cannot be logged` fails with `Expected number of calls: 0` / `Received number of calls: 1`. Then `bun test ./__tests__/websocket/wrap-ws-results.test.ts` reports 8 pass and 1 fail (the new test, same `"ERROR"` / `"INFO"` diff). Keep both outputs for your report.

### Step 2: Write the ERROR line for a throw or rejection

Edit `src/websocket/wrap-ws.ts` so it matches this diff against `c019a4f` exactly (this is the whole of commit 1's source change; it was lint-, format- and type-checked as written):

```diff
@@ imports
 import type { Logger, Options, StoreData } from '../interfaces'
+import { reportFormatError } from '../logger/emit'
 import { resolvePathFilter } from '../logger/path-filter'
 import type { PathFilter } from '../logger/path-filter'
+import { normalizeLoggedError } from '../utils/error'
 import { syntheticRequest } from '../utils/synthetic-request'
@@ after the WsHandlerHooks interface
   open?: (ws: TWs) => unknown
 }

+// Boxed so that a hook which throws `undefined` still counts as a failure.
+interface HookFailure {
+  error: unknown
+}
+
+type Settle = (failure?: HookFailure) => void
+
 const wsRequestCache = new Map<string, Request>()
@@ settleHook
 const settleHook = async (
   pending: Promise<unknown>,
-  done: () => void
+  done: Settle
 ): Promise<unknown> => {
   let value: unknown
   try {
     value = await pending
   } catch (error) {
-    done()
+    done({ error })
     throw error
   }
   done()
@@ afterHook
-const afterHook = (result: unknown, done: () => void): unknown => {
+const afterHook = (result: unknown, done: Settle): unknown => {
@@ logWs
   const logWs = (
-    level: 'INFO' | 'WARNING' | 'ERROR',
     ws: WebSocketLike,
     path: string,
     message: string,
-    extra?: Record<string, unknown>
+    extra?: Record<string, unknown>,
+    failure?: HookFailure
   ): void => {
@@ end of logWs
-    logger.log(level, request, { context, message, status: 200 }, store)
+    if (!failure) {
+      logger.log('INFO', request, { context, message, status: 200 }, store)
+      return
+    }
+    // The hook's own error must still reach Elysia, so a value that cannot be
+    // serialised is reported instead of thrown. No status: a failed hook sends
+    // the client none, as with a line from `log.error`.
+    try {
+      const { error } = normalizeLoggedError(
+        failure.error,
+        options.config?.logErrorPayload === true
+      )
+      logger.log('ERROR', request, { context, error, message }, store)
+    } catch (reportFailure) {
+      reportFormatError(reportFailure, options.config?.onError)
+    }
   }
@@ close
       close(ws, code, reason) {
-        const done = (): void => {
+        const done: Settle = failure => {
           if (options.config?.disableWebSocketLogging !== true) {
 …
             logWs(
-              'INFO',
               ws,
               path,
               'WebSocket closed',
-              Object.keys(extra).length > 0 ? extra : undefined
+              Object.keys(extra).length > 0 ? extra : undefined,
+              failure
             )
 …
         } catch (error) {
-          done()
+          done({ error })
           throw error
         }
@@ message
       message(ws, message) {
-        const done = (): void => {
+        const done: Settle = failure => {
           if (options.config?.disableWebSocketLogging !== true) {
-            logWs('INFO', ws, path, 'WebSocket message', {
-              payloadType: payloadTypeOf(message)
-            })
+            logWs(
+              ws,
+              path,
+              'WebSocket message',
+              { payloadType: payloadTypeOf(message) },
+              failure
+            )
           }
         }
 …
         } catch (error) {
-          done()
+          done({ error })
           throw error
         }
@@ open
-        const done = (): void => {
+        const done: Settle = failure => {
           if (options.config?.disableWebSocketLogging !== true) {
-            logWs('INFO', ws, path, 'WebSocket opened')
+            logWs(ws, path, 'WebSocket opened', undefined, failure)
           }
         }
 …
         } catch (error) {
-          done()
+          done({ error })
           throw error
         }
```

Notes on this step:

- The `close` wrapper keeps `contextStore.clearContext(ws)` and `wsTimings.delete(keyOf(ws))` exactly as they are in this commit.
- `settleHook` stays above `afterHook`, as today. Do not reorder.
- The error line keeps the event's message (`'WebSocket message'` and so on), because that is the only thing that tells open, message and close apart; the error's own message is in `error.message` and in the text line's `error` tree row.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/websocket/` reports 31 pass and 0 fail (the 23 existing tests, the 7 in the new file, and the 1 appended to `wrap-ws-results.test.ts`). `bun run typecheck` exits 0. `bun run lint` (root) exits 0. Commit as commit 1.

### Step 3: Write the failing tests for a generator hook

Create `packages/logixlysia/__tests__/websocket/wrap-ws-iterators.test.ts` with exactly this content:

```ts
import { expect, mock, test } from 'bun:test'
import { createRequestContextStore } from '../../src/context/request-context'
import type { Options } from '../../src/interfaces'
import { createLogger } from '../../src/logger'
import { createWsHandlerWrapper } from '../../src/websocket/wrap-ws'
import { sleep } from '../_helpers/sleep'

type TransportMock = ReturnType<
  typeof mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>
>

interface LogRecord {
  context?: Record<string, unknown>
  durationMs?: number
  error?: Record<string, unknown>
  status?: number
}

const setup = () => {
  const transport: TransportMock = mock(() => {})
  const contextStore = createRequestContextStore()
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  }
  const logger = createLogger(options, undefined, contextStore)
  const wrapWs = createWsHandlerWrapper(options, logger, contextStore)
  return { contextStore, transport, wrapWs }
}

const oneReply = function* oneReply(): Generator<string> {
  yield 'one'
}

const linesFrom = (transport: TransportMock): unknown[][] =>
  transport.mock.calls.map(call => [call[0], call[1]])

const recordAt = (transport: TransportMock, index: number): LogRecord =>
  (transport.mock.calls[index]?.[2] as LogRecord | undefined) ?? {}

test('a generator hook is logged after its last value, not when it returns', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    *message(_ws, _message) {
      yield 'one'
      yield 'two'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>
  expect(transport).not.toHaveBeenCalled()
  expect(replies.next()).toEqual({ done: false, value: 'one' })
  expect(transport).not.toHaveBeenCalled()
  expect(replies.next()).toEqual({ done: false, value: 'two' })
  expect(replies.next()).toEqual({ done: true, value: undefined })

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
  expect(recordAt(transport, 0).status).toBe(200)
})

test('an async generator hook is logged after its last value', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      yield 'one'
      await Promise.resolve()
      yield 'two'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  expect(await replies.next()).toEqual({ done: false, value: 'one' })
  expect(transport).not.toHaveBeenCalled()
  expect(await replies.next()).toEqual({ done: false, value: 'two' })
  expect(await replies.next()).toEqual({ done: true, value: undefined })

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that throws mid-stream writes one ERROR line', () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    *message(_ws, _message) {
      yield 'one'
      throw new Error('boom mid-stream')
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>
  expect(replies.next()).toEqual({ done: false, value: 'one' })
  expect(() => replies.next()).toThrow('boom mid-stream')

  expect(linesFrom(transport)).toEqual([['ERROR', 'WebSocket message']])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'boom mid-stream'
  })
  expect(recordAt(transport, 0)).not.toHaveProperty('status')
})

test('an async generator that throws mid-stream writes one ERROR line', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      yield 'one'
      await Promise.resolve()
      throw new Error('boom mid-stream')
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  await replies.next()
  await expect(replies.next()).rejects.toThrow('boom mid-stream')

  expect(linesFrom(transport)).toEqual([['ERROR', 'WebSocket message']])
  expect(recordAt(transport, 0).error).toMatchObject({
    message: 'boom mid-stream'
  })
})

test('a consumer that stops a generator early still gets exactly one line', async () => {
  const { transport, wrapWs } = setup()
  let cleanedUp = false
  const hooks = wrapWs('/chat', {
    async *message(_ws, _message) {
      try {
        yield 'one'
        yield 'two'
      } finally {
        cleanedUp = true
      }
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as AsyncIterator<unknown>
  await replies.next()
  await replies.return?.()
  await replies.return?.()

  expect(cleanedUp).toBe(true)
  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that only returns a value still hands that value on', () => {
  const { wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    // oxlint-disable-next-line require-yield -- the hook replies with its return value
    *message(_ws, _message) {
      return 'only'
    }
  })

  const replies = hooks.message({ id: 'ws-1' }, 'hi') as Iterator<unknown>

  expect(replies.next()).toEqual({ done: true, value: 'only' })
})

test('an async hook that resolves to a generator is logged after the generator finishes', async () => {
  const { transport, wrapWs } = setup()
  const hooks = wrapWs('/chat', {
    async message(_ws, _message) {
      await Promise.resolve()
      return oneReply()
    }
  })

  const replies = (await hooks.message(
    { id: 'ws-1' },
    'hi'
  )) as Iterator<unknown>
  expect(transport).not.toHaveBeenCalled()
  expect([...{ [Symbol.iterator]: () => replies }]).toEqual(['one'])

  expect(linesFrom(transport)).toEqual([['INFO', 'WebSocket message']])
})

test('a generator that outlives the close keeps its line timed from the open and its context', async () => {
  const { contextStore, transport, wrapWs } = setup()
  const raw = {}
  const hooks = wrapWs('/chat', {
    close(_ws) {},
    async *message(_ws, _message) {
      yield 'one'
      await sleep(30)
      yield 'two'
    },
    open(_ws) {}
  })

  hooks.open({ id: 'ws-1', raw })
  contextStore.mergeContext(raw, { room: 'lobby' })
  const replies = hooks.message(
    { id: 'ws-1', raw },
    'hi'
  ) as AsyncIterator<unknown>
  expect(await replies.next()).toEqual({ done: false, value: 'one' })
  hooks.close({ id: 'ws-1', raw })
  expect(
    await Array.fromAsync({ [Symbol.asyncIterator]: () => replies })
  ).toEqual(['two'])

  expect(linesFrom(transport)).toEqual([
    ['INFO', 'WebSocket opened'],
    ['INFO', 'WebSocket closed'],
    ['INFO', 'WebSocket message']
  ])
  const message = transport.mock.calls[2]?.[2] as LogRecord | undefined
  expect(message?.durationMs).toBeGreaterThanOrEqual(25)
  expect(message?.context).toEqual({
    payloadType: 'string',
    room: 'lobby',
    wsId: 'ws-1'
  })
  expect(contextStore.getContext(raw)).toEqual({})
})
```

The last test reproduces what Elysia does on a real socket (it keeps pulling after the close; see "Current state"). Its only timing assertion is a lower bound: the generator sleeps 30 ms between its two values and the line must show an age of at least 25 ms. A loaded machine only makes the sleep longer, so the bound cannot flake that way. Without the fix the age is about 0.1 ms.

Append this test to the end of `packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts`, after the one from Step 1:

```ts
test('a generator hook that fails mid-stream sends what it yielded and writes one ERROR line', async () => {
  const url = serve('/stream-fail', {
    async *message(_ws, m) {
      yield `${m}-1`
      await sleep(10)
      throw new Error('boom mid-stream')
    }
  })

  const { messages } = await exchange(url, 'hi')
  await waitFor(() => recordsNamed('WebSocket message').length > 0)

  expect(messages).toEqual(['hi-1'])
  expect(errors).toHaveLength(1)
  expect(errors[0]).toHaveProperty('message', 'boom mid-stream')
  const lines = recordsNamed('WebSocket message')
  expect(lines.map(call => call[0])).toEqual(['ERROR'])
  expect(lines[0]?.[2]).toMatchObject({
    error: { message: 'boom mid-stream' }
  })
})
```

**Verify**: `cd packages/logixlysia && bun test ./__tests__/websocket/` reports 33 pass and 7 fail. The 7 failures are, in `wrap-ws-iterators.test.ts`: `a generator hook is logged after its last value, not when it returns`, `an async generator hook is logged after its last value`, `a generator that throws mid-stream writes one ERROR line`, `an async generator that throws mid-stream writes one ERROR line`, `an async hook that resolves to a generator is logged after the generator finishes`, `a generator that outlives the close keeps its line timed from the open and its context` (the first assertion that trips is `expect(received).not.toHaveBeenCalled()` for most of them), and in `wrap-ws-results.test.ts` the generator test just appended (`-   "ERROR",` / `+   "INFO",`). The two iterator tests that pass before the fix (`a consumer that stops a generator early…` and `a generator that only returns a value…`) guard behaviour the fix must keep. Keep this output for your report.

### Step 4: Wait for the iterator before writing the line

Edit `src/websocket/wrap-ws.ts` so it matches this diff against your commit 1 exactly (lint-, format- and type-checked as written):

```diff
@@ after payloadTypeOf
   return typeof message
 }

+const isIterator = (
+  value: unknown
+): value is AsyncIterator<unknown> | Iterator<unknown> =>
+  typeof value === 'object' &&
+  value !== null &&
+  typeof (value as { next?: unknown }).next === 'function' &&
+  (Symbol.asyncIterator in value || Symbol.iterator in value)
+
+// `finally` writes the line once, whether the source finishes, throws or is
+// stopped early by the consumer.
+const settleIterator = function* settleIterator(
+  source: Iterator<unknown>,
+  done: Settle
+): Generator<unknown, unknown> {
+  let failure: HookFailure | undefined
+  try {
+    return yield* { [Symbol.iterator]: () => source }
+  } catch (error) {
+    failure = { error }
+    throw error
+  } finally {
+    done(failure)
+  }
+}
+
+const settleAsyncIterator = async function* settleAsyncIterator(
+  source: AsyncIterator<unknown>,
+  done: Settle
+): AsyncGenerator<unknown, unknown> {
+  let failure: HookFailure | undefined
+  try {
+    return yield* { [Symbol.asyncIterator]: () => source }
+  } catch (error) {
+    failure = { error }
+    throw error
+  } finally {
+    done(failure)
+  }
+}
+
+// Used for a hook's direct result and for what a Promise resolved to, since
+// Elysia iterates an iterator in either case. A returned iterator is pulled
+// after the hook returns, so its line waits for the last value.
+const settleValue = (value: unknown, done: Settle): unknown => {
+  if (isIterator(value)) {
+    return Symbol.asyncIterator in value
+      ? settleAsyncIterator(value as AsyncIterator<unknown>, done)
+      : settleIterator(value as Iterator<unknown>, done)
+  }
+  done()
+  return value
+}
+
 const settleHook = async (
   pending: Promise<unknown>,
   done: Settle
@@ end of settleHook
     done({ error })
     throw error
   }
-  done()
-  return value
+  return settleValue(value, done)
 }

 /**
- * Hands the hook's result back to Elysia untouched, so a returned value is
- * sent, a generator is iterated and a rejection reaches Elysia's catch. The
- * lifecycle line is written once the result has settled. The `instanceof
- * Promise` test is the one Elysia itself uses (`ws/index.mjs:116`).
+ * Hands the hook's result back to Elysia in a form it treats the same way, so
+ * a returned value is sent, a generator is iterated and a rejection reaches
+ * Elysia's catch. The lifecycle line is written once the result has settled.
+ * The `instanceof Promise` and `next` tests are the ones Elysia itself uses
+ * (`createHandleWSResponse` in `elysia/dist/ws/index.mjs`).
  */
-const afterHook = (result: unknown, done: Settle): unknown => {
-  if (result instanceof Promise) {
-    return settleHook(result, done)
-  }
-  done()
-  return result
-}
+const afterHook = (result: unknown, done: Settle): unknown =>
+  result instanceof Promise
+    ? settleHook(result, done)
+    : settleValue(result, done)

@@ inside createWsHandlerWrapper
   const wsTimings = new WeakMap<object, bigint>()
+  // Elysia keeps pulling a message hook's iterator after the socket closes, so
+  // its line can come after the close has cleared the context.
+  const closedContexts = new WeakMap<
+    object,
+    Readonly<Record<string, unknown>>
+  >()

@@ inside logWs
     const beforeTime = wsTimings.get(keyOf(ws)) ?? process.hrtime.bigint()
     const store: StoreData = { beforeTime }
-    const accumulated = contextStore.peekContext(ws)
+    const live = contextStore.peekContext(ws)
+    const accumulated =
+      Object.keys(live).length > 0
+        ? live
+        : (closedContexts.get(keyOf(ws)) ?? live)
     const context =
@@ inside close's done
               failure
             )
           }
+          // The open time stays, for a message line written after this one.
+          closedContexts.set(keyOf(ws), contextStore.peekContext(ws))
           contextStore.clearContext(ws)
-          wsTimings.delete(keyOf(ws))
         }
@@ inside open
       open(ws) {
         wsTimings.set(keyOf(ws), process.hrtime.bigint())
+        closedContexts.delete(keyOf(ws))
         const done: Settle = failure => {
```

Why each part is there, so you can judge a lint or type complaint without changing behaviour:

- `settleValue` sits between the iterator helpers and `settleHook` because `settleHook` now calls it and `afterHook` calls both; any other order trips `no-use-before-define`.
- `isIterator` is the test both Elysia lines use. An object with `next` but neither iterator symbol is passed through untouched with the line written at once, as today.
- The wrappers delegate with `yield*` to the source object itself, so `next`, `return` and `throw` reach the user's generator, and `return yield*` keeps a generator's return value (Elysia 1.4 sends it when the first `next()` is already done).
- `wsTimings.delete` is removed and `closedContexts` added because Elysia keeps pulling a `message` generator after the close, so its line can come after the "WebSocket closed" line; without them that line shows an age of about 0 ms and loses the connection's context. Both maps are `WeakMap`s keyed by the raw socket, so nothing outlives the connection. `open` drops a stale entry.
- `contextStore.clearContext(ws)` still runs on close: `getContext` after close is still `{}`.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/websocket/` reports 40 pass and 0 fail. Run it three times; all three must be 40 pass. `bun run typecheck` exits 0. `bun run lint` (root) exits 0. Commit as commit 2.

### Step 5: Say it on the WebSocket docs page

In `apps/docs/content/features/websocket.mdx`:

Replace line 39 (it begins `A hook may reply by returning a value`) with:

```md
A hook may reply by returning a value, a promise or a generator. A wrapped hook replies exactly as an unwrapped one does: Elysia sends a returned value, waits for a promise, and sends each value a generator yields.
```

In line 41, delete the three words ` on every line` that follow ``status `200` ``, so the phrase reads ``status `200`, and optional `wsId` in context``. Leave the rest of that paragraph as it is.

Directly after line 41's paragraph, add this paragraph:

```md
A hook that throws or rejects gets an `ERROR` line in place of its usual line. That line carries the error in its `error` field, as an HTTP error line does, and no status, since the client was sent none; the error still reaches Elysia's `onError`. A hook that returns a generator is logged when the generator finishes, so the connection's age on that line includes the time spent sending, and a throw inside the generator gets the same `ERROR` line.
```

Every sentence there is pinned by a test from Steps 1 and 3 or by the measurements in "Why this matters". Do not add other claims or a code sample. Do not touch the "Disable WebSocket logs" section: `disableWebSocketLogging` still silences every line, the error lines included.

**Verify**: `bun run format` (root), read its diff, then `bun run lint` exits 0 and `cd apps/docs && bun run typecheck` exits 0. Commit as commit 3.

### Step 6: Changeset, gates

Create `.changeset/wrap-ws-hook-outcomes.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

`patch`: a fix, with no new option, export or field. The paragraph says, in your own plain words: a `wrapWs` hook that throws or rejects is now logged as an `ERROR` line carrying the error and no status, where it used to be an `INFO` line with status 200 and no error; a hook that returns a generator is now logged when the generator finishes, with an `ERROR` line if it throws, where the line used to be written before the generator ran. Replies to the client and Elysia's `onError` are unchanged.

**Verify**: `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail and 1266 tests across 102 files (1249 at `c019a4f`, plus 7, 8 and 2 new). If one of the child-process tests named under "Commands" times out, rerun that file alone; it must pass. `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty. Commit as commit 4, staging files by name. `git status --porcelain` is empty afterwards.

## Test plan

- `__tests__/websocket/wrap-ws-failures.test.ts` (new, 7 tests): ERROR line with the error and no status for a sync throw, a rejection, a throwing `open` and a rejecting `close` (which still clears the context); the success line unchanged; `disableWebSocketLogging` silences the error line; an error that cannot be serialised is reported to `onError` and the hook's own error still reaches the caller. 5 fail before Step 2.
- `__tests__/websocket/wrap-ws-iterators.test.ts` (new, 8 tests): sync and async generators logged after the last value; a throw mid-stream gives one ERROR line; early `return()` gives one line and runs the source's `finally`; a return-only generator still hands its value on; a promise that resolves to a generator waits for the generator; a generator that outlives the close keeps its age and context. 6 fail before Step 4.
- `__tests__/websocket/wrap-ws-results.test.ts` (2 appended, real server and client): a rejecting hook on a real socket and a generator failing mid-stream on a real socket each give exactly one ERROR "WebSocket message" record and still reach `onError`; the second also checks the client got `['hi-1']`. Each fails before its step.
- The 23 existing websocket tests, unchanged, prove the hook's result still reaches Elysia as before.

## Done criteria

ALL must hold:

- [ ] Your report quotes the Step 1 run (2 pass, 5 fail; then 8 pass, 1 fail) and the Step 3 run (33 pass, 7 fail), each made before the matching source change
- [ ] `cd packages/logixlysia && bun test ./__tests__/websocket/` reports 40 pass, 0 fail, three runs in a row
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the six in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/__tests__/websocket/wrap-ws.test.ts packages/logixlysia/__tests__/websocket/wrap-ws-server.test.ts packages/logixlysia/__tests__/websocket/log-filter-paths.test.ts` is empty, and the diff of `wrap-ws-results.test.ts` only adds lines at the end
- [ ] `grep -n "status: 200" packages/logixlysia/src/websocket/wrap-ws.ts` shows exactly one line, inside the `!failure` branch
- [ ] The API snapshot is unchanged: `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty
- [ ] `git log --format=%s <base>..HEAD` shows the four subjects from "Git workflow", in order

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code, or `node_modules/elysia/package.json` is not version 1.4.30 and its `createHandleWSResponse` no longer tests `instanceof Promise` and `typeof data?.next == "function"`.
- A Step 1 or Step 3 count differs from the plan's (a test this plan says fails passes before the fix, or one it says passes fails).
- Any of the 23 existing websocket tests fails at any step. That means a hook's result no longer reaches Elysia as before, which this plan must not change.
- The fix seems to need a change to `src/index.ts`, `src/logger/emit.ts`, `src/utils/error.ts`, `src/output/index.ts` or any file outside the scope list.
- The API snapshot test fails. Nothing in this plan is exported.
- A websocket test fails on CI's "Test on Elysia next" or "Test on Elysia rc" job (if you are told to push). Elysia 2 was read, not run, while planning.

## Maintenance notes

- The `Settle` callback is the one place that decides a line's level. A new hook wrapper (a `drain` hook, say) should take a `Settle` and go through `afterHook` so it gets the same three outcomes.
- If Elysia changes how it recognises an iterator or a promise, `isIterator` and the `instanceof Promise` test in `afterHook` must follow. Elysia 2 (`ws/route.mjs`) awaits any thenable (`typeof result?.then === "function"`), where this file waits only for a real `Promise`; a hook that returns a non-`Promise` thenable on Elysia 2 still gets its line before it settles. Not fixed here: Elysia 1.4 uses `instanceof Promise`, and no report of a thenable hook exists.
- A value merged into the connection's context from inside a generator after the close goes into a fresh bag; the late line then shows that bag and not the one the close cleared, and nothing clears the fresh bag until the socket is collected. Rare (it needs a merge after the close while the generator is still running); left as is.
- An iterator that is returned but never pulled gets no line, since its body never ran. Both Elysia lines always pull.
- A reviewer should check that every path through `settleIterator`/`settleAsyncIterator` calls `done` exactly once (finish, throw, early `return()`), and that `logWs` cannot throw on the failure path, because a throw there would replace the hook's error on its way to Elysia.
- Left out, already recorded in `plans/README.md`: the HTTP upgrade request for a WebSocket route logs `INFO` with an empty message and status 200 (the probe shows it as `INFO  status=200 ctx=undefined`), and hook sockets are typed without `send`.
