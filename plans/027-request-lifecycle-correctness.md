# Plan 027: Log the real status, never lose a request's log line, and stop emitting two final lines

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478f40d..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/logger/index.ts packages/logixlysia/src/types/logger.ts packages/logixlysia/src/types/core.ts packages/logixlysia/src/context/storage.ts packages/logixlysia/__tests__/plugin`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 025 adds an `.onStop` hook to
> `index.ts`; that alone is not a conflict — the hooks this plan edits are
> `onRequest`, `onAfterHandle`, `onError` and the `logger` wrapper.)

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

Five defects in the plugin's request hooks, all verified by running the plugin in-process:

1. **A handler that returns a `Response` is logged as `200`** regardless of its real status. `onAfterHandle` reads only `set.status`; `response.status` is ignored even though `response` is already in hand. Streaming, redirects, proxies and file serving all take this path, so 4xx/5xx from them are under-reported, logged at `INFO`, and never trigger `tail.status` sampling.
2. **A dropped custom log suppresses the access log.** `didCustomLog.add(request)` runs before the level filter and sampling gate. With `logFilter: { level: ['INFO','WARNING','ERROR'] }` (or `sampling.head.DEBUG: 0`), a handler containing `log.debug(...)` produces zero lines for the whole request.
3. **Two final lines when an error is thrown after the handler** (a throwing `afterHandle`, `mapResponse`, or response validation): `onAfterHandle` logs a `200` line and clears timing/context, then `onError` logs a `500` line with `0ms` and no context. Sampling `finalize` also runs twice for the same key.
4. **In-handler custom logs show `0.00ms` and `200`.** `logWithContext` starts a fresh timer at call time and the formatter defaults a missing status to 200, so the one line that survives for a logged request carries neither the request's duration nor its final status.
5. **`store.beforeTime` is a public field frozen at `0n`**, and `loggerStorage.enterWith(...)` leaves the last request's logger in the caller's async context after the request ends.

## Current state

Files and roles:

- `packages/logixlysia/src/index.ts` — plugin factory; the `logger` wrapper (79–113), `createRequestScopedLogger` (115–123), `closeRequest` (151–186), hooks (198–277).
- `packages/logixlysia/src/logger/index.ts` — `createLogger`; `logWithContext` (175–186) builds `store: { beforeTime: process.hrtime.bigint() }` for custom logs; `log` (121–138); `finalizeRequest` (141–173).
- `packages/logixlysia/src/types/logger.ts` — `Logger` interface (3–58): `debug/error/info/warn(request, message, context?)`, `log(level, request, data, store)`.
- `packages/logixlysia/src/types/core.ts` — `StoreData { beforeTime: bigint }`, `LogixlysiaStore { beforeTime?: bigint; logger; pino }`.
- `packages/logixlysia/src/context/storage.ts` — `loggerStorage` (ALS), `NOOP_LOGGER`, `useLogger()`.
- `packages/logixlysia/src/logger/create-logger.ts:512–533` — `getStatusTokens` defaults a missing `data.status` to `200`.
- `packages/logixlysia/src/utils/duration.ts` — `elapsedMs(beforeTime)` returns `0` for `BigInt(0)`.
- `packages/logixlysia/__tests__/plugin/logixlysia.test.ts` — plugin tests; `'does not duplicate logs when a custom log is emitted'` (line 47) pins that an *emitted* custom log replaces the access line.

The wrapper and hooks today (`src/index.ts`):

```ts
  const logger = {
    ...baseLogger,
    debug: (request: Request, message: string, context?: Record<string, unknown>) => {
      didCustomLog.add(request)
      baseLogger.debug(request, message, context)
    },
    // error / info / warn identical
  }
  ...
  const closeRequest = (request, setHeaders, status, responseHeaders?): StoreData => {
    if (requestIdConfig) { /* echo header */ }
    const store: StoreData = {
      beforeTime: requestStartTimes.get(request) ?? BigInt(0)
    }
    if (enrichers) { applyResponseEnrichers(...) }
    logger.finalizeRequest(request, store, status)
    return store
  }
  ...
    .state('beforeTime', BigInt(0))
    .derive(({ request }) => ({ log: createRequestScopedLogger(request) }))
    .onStart(...)
    .onRequest(({ request }) => {
      requestStartTimes.set(request, process.hrtime.bigint())
      logger.beginRequest(request)
      if (requestIdConfig) { ... }
      if (enrichers) { applyRequestEnrichers(...) }
      if (options.config?.useAsyncLocalStorage) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
    .onAfterHandle(({ request, set, response }) => {
      try {
        const status =
          set.status === undefined || set.status === null
            ? 200
            : getStatusCode(set.status)
        const store = closeRequest(request, set.headers, status,
          response instanceof Response ? response.headers : undefined)
        if (didCustomLog.has(request)) {
          return
        }
        let level: 'INFO' | 'WARNING' | 'ERROR' = 'INFO'
        if (status >= 500) { level = 'ERROR' } else if (status >= 400) { level = 'WARNING' }
        const accumulated = contextStore.getContext(request)
        const data: Record<string, unknown> = { status }
        if (Object.keys(accumulated).length > 0) { data.context = { ...accumulated } }
        logger.log(level, request, data, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
    .onError(({ request, error, set }) => {
      try {
        const store = closeRequest(request, set.headers, errorStatus(error))
        logger.handleHttpError(request, error, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
    .as('scoped') as Logixlysia<TFields>
```

`logWithContext` today (`logger/index.ts:175–186`):

```ts
  const logWithContext = (level, request, message, context?): void => {
    if (sinks.isEffectivelyDisabled || !shouldLog(level, config?.logFilter)) {
      return
    }
    const store: StoreData = { beforeTime: process.hrtime.bigint() }
    log(level, request, { context, message }, store)
  }
```

Sampling: `emit()` (`logger/emit.ts:166–181`) may also `drop` or `buffer` a custom record after `logWithContext` let it through.

Observed behaviour (scratch run at HEAD):

```
GET /custom 200 0.00ms custom line      ← custom log replaces access line; duration/status are placeholders
GET /resp 200                            ← handler returned new Response('nope', { status: 404 }); wire was 404
GET /ok 200 2ms  … then  GET /ok 500 0ms afterHandle boom   ← two lines for one request
```

Elysia facts verified at HEAD (elysia 1.4.30 in `node_modules`): a `beforeHandle` that returns a value still runs `onAfterHandle`; a 404 for an unmatched route goes through `onRequest` then `onError`; `onError` may run after `onAfterHandle` for the same request when a later hook throws.

Conventions: Biome via `ultracite`; plugin tests use `new Elysia().use(logixlysia(options)).get(...)` + `app.handle(new Request(...))` with a capture transport (`__tests__/plugin/logixlysia.test.ts:7–20`), `disableInternalLogger: true`, `disableFileLogging: true`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint / Format | `bun run lint` / `bun run format` | exit 0 |
| Plugin tests | `cd packages/logixlysia && bun test __tests__/plugin` | all pass |
| Full tests | `cd packages/logixlysia && bun test` | all pass |
| Bench (regression check) | `bun run bench` | request-path suites within noise of `main` |

## Scope

**In scope**:

- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/src/logger/index.ts`
- `packages/logixlysia/src/types/logger.ts` (only if Step 4 needs a new optional parameter)
- `packages/logixlysia/src/context/storage.ts` (export `NOOP_LOGGER` if needed)
- `packages/logixlysia/__tests__/plugin/lifecycle.test.ts` (create)
- `packages/logixlysia/__tests__/plugin/logixlysia.test.ts` (adjust only if an assertion pins a behaviour this plan changes — see Step 4)
- `apps/docs/content/features/request-context.mdx` and `apps/docs/content/migration-from-evlog.mdx` (one sentence each if custom-log semantics wording changes)
- `.changeset/<slug>.md`
- `plans/README.md`

**Out of scope**:

- `src/logger/emit.ts`, `src/sampling/*` — sampling semantics stay as they are.
- `src/logger/create-logger.ts` — the `200` default in `getStatusTokens` stays (Step 4 supplies a real status instead).
- `src/websocket/wrap-ws.ts` — separate finding.
- Changing whether an emitted custom log replaces the access log (a product decision; see Maintenance notes).

## Git workflow

- Branch: `improve/027-request-lifecycle-correctness` off `main`.
- Conventional commits, one per step: `fix(plugin): log the status of a returned Response`, `fix(plugin): only suppress the access log for custom logs that reached a sink`, `fix(plugin): close a request once even when onError follows onAfterHandle`, `fix(plugin): custom logs carry the request's elapsed time`, `fix(plugin): populate store.beforeTime and reset the ALS logger after a request`.
- No `Co-Authored-By: Claude` trailer.
- Changeset `.changeset/request-lifecycle.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  Access logs now report the status of a returned `Response`; a custom log that was filtered or sampled out no longer suppresses the access log; an error thrown after the handler produces one final line with the request's real duration and context; in-handler custom logs show the elapsed request time instead of `0ms`; `store.beforeTime` is populated per request; the AsyncLocalStorage logger is reset when a request ends.
  ```

- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Status of a returned `Response`

In `onAfterHandle`, compute status as: explicit `set.status` wins; otherwise `response instanceof Response ? response.status : 200`.

```ts
        const status =
          set.status === undefined || set.status === null
            ? response instanceof Response
              ? response.status
              : 200
            : getStatusCode(set.status)
```

Biome forbids nested ternaries (`noNestedTernary`); write it as a small helper `resolveHandledStatus(set.status, response)` with early returns.

**Verify**: new test in `__tests__/plugin/lifecycle.test.ts` `'logs the status of a returned Response'`: route returns `new Response('nope', { status: 404 })`; capture transport receives level `WARNING` and `meta.status === 404`. Also `'set.status wins over response.status'`: handler sets `set.status = 201` and returns `new Response('x', { status: 200 })` → `meta.status === 201`.

### Step 2: Mark `didCustomLog` only when a record reached a sink

Change `logWithContext` in `logger/index.ts` to return `boolean`: `false` when it early-returns, `true` after calling `log(...)`. Sampling may still drop the record inside `emit`; that is acceptable (the record was "emitted" from the caller's view and tail sampling may replay it), but the level filter and disabled-sinks cases must return `false`.

Update `Logger`'s `debug/error/info/warn` return types in `types/logger.ts` to `boolean` — wait: `Logger` is public. Keep the public signature `=> void` and instead expose the gate separately: add an internal helper in `logger/index.ts` exported as `willEmit(level): boolean` on the returned object? That also widens the public type. Simplest non-breaking route: the plugin already has `options`; in `index.ts` compute once `const filter = options.config?.logFilter` and `const sinks = resolveSinks(options.config)` (import `resolveSinks` and `shouldLog` from `./logger/emit`), and in the wrapper:

```ts
    info: (request, message, context) => {
      if (!sinks.isEffectivelyDisabled && shouldLog('INFO', filter)) {
        didCustomLog.add(request)
      }
      baseLogger.info(request, message, context)
    },
```

(one helper `markIfEmitting(level, request)` used by all four).

**Verify**: tests `'a filtered-out debug log does not suppress the access log'` (`logFilter: { level: ['INFO'] }`, handler calls `log.debug`, transport receives exactly one `INFO` access record) and `'a head-sampled-out debug log still suppresses nothing'` is NOT required (sampling drop inside emit is accepted). Keep the existing `'does not duplicate logs when a custom log is emitted'` test green.

### Step 3: Close a request exactly once

Introduce `const closed = new WeakSet<Request>()` next to `didCustomLog`. Move the cleanup (`requestStartTimes.delete`, `contextStore.clearContext`) out of both `finally` blocks into a single `finishRequest(request)` that is only called once, and make `closeRequest` return early if already closed:

- `onAfterHandle`: run as today, but do **not** clean up in `finally`. Instead, after logging, call `finishRequest(request)` **only if** you can be sure no `onError` will follow. You cannot — so defer cleanup: keep `requestStartTimes` and the context bag alive and let `onError` (if it runs) reuse them.
- `onError`: if `closed.has(request)` (meaning `onAfterHandle` already emitted a final line), still log the error line — but with the real `beforeTime` (still present) and the real context (still present) — and then `finishRequest`. Skip `logger.finalizeRequest` on the second close (sampling was already finalized).
- To avoid leaking `requestStartTimes` entries for requests that finish via `onAfterHandle` with no subsequent error: `requestStartTimes` is a `WeakMap` and the context store is a `WeakMap`, so entries are collected with the `Request`. Therefore: remove the `finally` cleanup from `onAfterHandle` entirely and keep it in `onError` only, and add `closed.add(request)` in `onAfterHandle` after logging. Document in a comment that both maps are weak, so skipping explicit cleanup on the success path is safe. Confirm `contextStore` is weak: `src/context/request-context.ts:20` uses `new WeakMap<ContextKey, ...>()` (yes).

Concretely:

```ts
    .onAfterHandle(({ request, set, response }) => {
      if (closed.has(request)) { return }
      const status = resolveHandledStatus(set.status, response)
      const store = closeRequest(request, set.headers, status,
        response instanceof Response ? response.headers : undefined)
      closed.add(request)
      if (didCustomLog.has(request)) { return }
      ...logger.log(level, request, data, store)
      // No cleanup: requestStartTimes and the context bag are WeakMaps keyed by
      // the Request, and onError may still run for this request.
    })
    .onError(({ request, error, set }) => {
      try {
        const alreadyClosed = closed.has(request)
        const store: StoreData = { beforeTime: requestStartTimes.get(request) ?? BigInt(0) }
        if (!alreadyClosed) {
          closeRequest(request, set.headers, errorStatus(error))   // enrichers + finalize + request-id echo
          closed.add(request)
        }
        logger.handleHttpError(request, error, store)
      } finally {
        requestStartTimes.delete(request)
        contextStore.clearContext(request)
      }
    })
```

Note `closeRequest` already builds the store; refactor so the error path gets the store from it when not already closed, and builds it from `requestStartTimes` otherwise.

**Verify**: tests `'an error thrown in afterHandle yields one success line and one error line with real duration and context'` — configure `requestId: true`, route with `afterHandle: () => { throw new Error('boom') }`; capture transport receives two records (this plan accepts the first line — it was already emitted — but asserts the error record has `meta.durationMs > 0` and `meta.context.requestId` defined). And `'a request that succeeds emits exactly one record'` (regression).

Rationale for keeping two lines: the success line has already been written when the error occurs; retracting it is impossible. The fix makes the error line truthful.

### Step 4: Custom logs carry the request's elapsed time

In `index.ts` the wrapper has `requestStartTimes`. Instead of calling `baseLogger.info(request, message, context)` (which starts a fresh timer), call the low-level `baseLogger.log(level, request, { context, message }, { beforeTime: requestStartTimes.get(request) ?? process.hrtime.bigint() })` **after** applying the same gate `logWithContext` applies (`sinks.isEffectivelyDisabled`, `shouldLog`). This keeps `Logger.info(...)` (public, used by `store.logger.info(request, ...)`) unchanged for direct callers and only changes the plugin-derived `log` and `store.logger` wrappers.

Do not add a status to custom records; the formatter's `200` default remains for them. (A future plan may render `-`; out of scope.)

**Verify**: test `'custom logs report elapsed request time'`: handler does `await Bun.sleep(15); log.info('x')`; capture transport record has `meta.durationMs >= 10`.

Check `__tests__/plugin/logixlysia.test.ts` and `__tests__/plugin/concurrent-timing.test.ts` for assertions on custom-log `durationMs` being ~0; if one exists and pins the old behaviour, update it and note the change in the changeset.

### Step 5: Populate `store.beforeTime`; reset the ALS logger

- In `onRequest`, after `requestStartTimes.set(...)`, also set the Elysia store: the hook receives `store`; assign `store.beforeTime = start`. (If the `onRequest` context does not expose `store` under `.as('scoped')`, use the same `start` value in `.derive` — `derive` receives `store` — and report which worked.)
- Export `NOOP_LOGGER` from `context/storage.ts` (as `noopRequestLogger`). In `onError`'s `finally` and at the end of `onAfterHandle` (both exits), when `options.config?.useAsyncLocalStorage` is true, call `loggerStorage.enterWith(noopRequestLogger)` so a continuation outside the request sees a no-op rather than the last request's logger.

**Verify**: tests `'store.beforeTime is set during a request'` (handler asserts `store.beforeTime !== 0n` via returning it) and `'useLogger() outside a finished request is a no-op'`: `useAsyncLocalStorage: true`, handle one request, then call `useLogger().info('after')` → capture transport received exactly one record (the access line), not two.

### Step 6: Docs wording, changeset, format, full gate

If `features/request-context.mdx` or `migration-from-evlog.mdx` describe custom logs as showing `0ms` (they do not appear to), no change. Otherwise leave docs alone. Create the changeset; `bun run format`.

**Verify**: `bun run lint && bun run typecheck && cd packages/logixlysia && bun test` → all exit 0. `bun run bench` → the "structured sink" and "floor" suites within noise of a run on `main` (the wrapper adds one `WeakSet` lookup and one `shouldLog` per custom log; no per-request cost is added).

## Test plan

- New file `__tests__/plugin/lifecycle.test.ts` with the seven tests named above, modelled on `__tests__/plugin/logixlysia.test.ts` (`createCaptureTransport` pattern; copy the helper locally, do not import across test files).
- Existing plugin tests stay green; if `concurrent-timing.test.ts` pins custom-log duration ≈ 0, update with a comment.

## Done criteria

- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 7 new tests
- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `grep -n "closed" packages/logixlysia/src/index.ts` shows the `WeakSet` and its two uses
- [ ] Scratch check (optional): the three observed behaviours in "Current state" now print `404`, one truthful error line, and non-zero custom-log duration
- [ ] `.changeset/request-lifecycle.md` exists
- [ ] `git status` clean outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

- `onAfterHandle`/`onError`/the `logger` wrapper no longer match the excerpts.
- Elysia's `onRequest` context does not expose `store` and `derive` cannot set it either (report; leave `beforeTime` as is).
- Any existing test asserts that a request with an emitted custom log yields exactly one record AND that record's duration is `0` — report before changing the assertion.
- The bench shows > 5 % regression on the floor suite (indicates per-request work was added to the hot path; report the diff).

## Maintenance notes

- Product decision deferred: whether an emitted custom log should keep suppressing the access line at all. Both evlog-style wide events and "always emit the access line" are defensible; today's behaviour is pinned by `'does not duplicate logs when a custom log is emitted'`. If the maintainer flips it, add `config.accessLog: 'always' | 'unless-custom'` rather than changing the default silently.
- Reviewer focus: the success path no longer clears the context bag eagerly (WeakMap semantics carry it); verify no code reads `contextStore` for a request after `onAfterHandle` expecting it to be empty.
- Plan 025's `.onStop` and this plan's hook edits touch the same file; whichever lands second rebases.
