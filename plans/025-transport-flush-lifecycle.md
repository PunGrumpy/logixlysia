# Plan 025: Implement the transport `flush()`/`close()` lifecycle and flush on `onStop`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 478f40d..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/types/config.ts packages/logixlysia/src/output/index.ts packages/logixlysia/src/output/file-sink.ts packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/desertant.ts apps/docs/content/adapters/overview.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Plan 026 is expected to have
> changed `adapters/shared.ts`; confirm it landed (its `flush()` awaits the
> full send tail) — if it has not, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/026-adapter-batch-queue-ordering-and-error-routing.md (merged)
- **Category**: bug (implements an accepted design)
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

The design for this was decided on 2026-08-10 in `plans/spikes/020-transport-lifecycle-design.md` and accepted for implementation, but never built. Meanwhile nine batching adapters shipped that each expose `flush()`, and the docs now tell every user to hand-roll `process.on('SIGTERM')` and call `axiom.flush()` themselves.

Today the plugin registers `onStart`, `onRequest`, `onAfterHandle`, `onError` and no `onStop`. On `app.stop()` or a rolling restart, every HTTP adapter loses up to `maxBatchSize - 1` entries plus the current `flushIntervalMs` window (defaults 19 entries / 2 s), and the file sink loses whatever batch is still in `pendingBatch`/`flushChain`. The last lines before a shutdown are the ones people look for.

This plan transcribes the spike's design into code: optional `flush`/`close` on `Transport`, `flush`/`close` on the file sink, an in-flight tracker, `flushAll`, an `onStop` hook bounded by `flushTimeoutMs`, and a manual `flushLogixlysia()` export for callers who own the process.

## Current state

Files and roles:

- `packages/logixlysia/src/index.ts` — plugin; hook chain at lines 198–277 is `.state(...)…derive(...).onStart(...).onRequest(...).onAfterHandle(...).onError(...).as('scoped')`. No `onStop`.
- `packages/logixlysia/src/types/config.ts` — `Transport` (5–11), `SinkErrorContext` (97–100), `OutputConfig` (143–160).
- `packages/logixlysia/src/output/index.ts` — `logToTransports` (20–53); creates `reportTransportError = createErrorReporter('transport', 'transport failed')`.
- `packages/logixlysia/src/output/file-sink.ts` — `FileSinkImpl` with `flushChain` (53), `write` (59–85), `ensureOpen` (115–128), `maybeRotate` (144–176); `FileSink` interface (28–31); module-level `sinks` Map (181) and `getFileSink` (183–190). Line 178 reads `// see plans/020: flush()/close() lifecycle would await `flushChain` here.`
- `packages/logixlysia/src/adapters/shared.ts` — `AdapterTransport extends Transport { flush: () => Promise<void> }` (45–48); after plan 026, `flush()` awaits all queued sends.
- `packages/logixlysia/src/desertant.ts` — `RedactingTransport.flush` (114–117, 410–413) drains its queue then calls the wrapped transport's `flush?.()`.
- `apps/docs/content/adapters/overview.mdx` — "Graceful Shutdown" section (lines ~103–122) with the hand-rolled SIGTERM snippet.

`Transport` today:

```ts
export interface Transport {
  log: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>
}
```

`SinkErrorContext` today:

```ts
export interface SinkErrorContext {
  error: unknown
  sink: 'enricher' | 'file' | 'rotation' | 'transport'
}
```

`FileSink` today:

```ts
export interface FileSink {
  /** Resolves after `line` is durably written to disk. */
  write: (line: string, options: FileSinkOptions) => Promise<void>
}
```

`FileSinkImpl` fields today: `filePath`, `handle: FileHandle | null`, `bytesWritten`, `openedAt`, `latestOptions`, `pendingBatch`, `flushChain: Promise<void> = Promise.resolve()`. `maybeRotate` sets `this.handle = null` and closes the old handle before `performRotation`.

`logToTransports` today attaches `.catch(...)` to a returned promise and forgets it (`output/index.ts:40–48`).

Spike 020's decided facts (verified against Elysia 1.4.29): `onStop` fires whether or not the plugin is `.as('scoped')`; `app.stop()` does NOT await an async `onStop`; a bare SIGINT with no handler kills the process without running `onStop`. Design decisions from the spike that this plan must honour:

- `flush`/`close` are optional on `Transport`; absent means no-op.
- The plugin's automatic `onStop` **flushes only, never closes** (the file-sink `sinks` Map is process-wide and another plugin instance may still be writing).
- Shutdown flush is bounded by `config.flushTimeoutMs` (default 5000); `0` opts out of blocking.
- A timeout is reported via `onError({ sink: 'shutdown' })` when the hook exists, else one stderr line — never both.
- In-flight `log()` promises are tracked in a bounded `Set` (max 1024; oldest dropped on overflow).
- A manual `flushLogixlysia()`-style export exists for callers who own the process; `close` is reachable only through that path.

Conventions: Biome via `ultracite` (single quotes, no semicolons). Sink error reporters route to `onError` XOR stderr (`utils/report.ts`, `output/file.ts:44–60`). Tests: `bun:test`; plugin tests build `new Elysia().use(logixlysia(options))` and call `app.handle(new Request(...))` (see `__tests__/plugin/logixlysia.test.ts`); file-sink tests use `createTempDir`/`removeTempDir` from `__tests__/_helpers/tmp.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint / Format | `bun run lint` / `bun run format` | exit 0 |
| Tests | `cd packages/logixlysia && bun test` | all pass |
| Targeted | `cd packages/logixlysia && bun test __tests__/plugin/shutdown.test.ts __tests__/output` | all pass |
| Build | `cd packages/logixlysia && bun run build` | `✓ Build completed` |

## Scope

**In scope**:

- `packages/logixlysia/src/types/config.ts`
- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/src/output/file-sink.ts`
- `packages/logixlysia/src/index.ts`
- `packages/logixlysia/src/interfaces.ts` (only if a new type needs re-exporting through the compatibility barrel — probably not)
- `packages/logixlysia/__tests__/plugin/shutdown.test.ts` (create)
- `packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts` (create)
- `packages/logixlysia/__tests__/api/__snapshots__/surface.test.ts.snap` (update if plan 024 landed — the root entry gains `flushLogixlysia`)
- `apps/docs/content/adapters/overview.mdx` (Graceful Shutdown section)
- `apps/docs/content/configuration.mdx` (document `flushTimeoutMs`)
- `apps/docs/content/features/transports.mdx` (document optional `flush`/`close` on custom transports)
- `.changeset/<slug>.md`
- `plans/README.md`

**Out of scope**:

- `src/adapters/shared.ts` and the nine adapters — already expose `flush`; do not add `close` to them in this plan.
- `src/desertant.ts` — already forwards `flush`.
- Signal handling (`process.on('SIGTERM')`) — deliberately not installed by the library; documented as the user's responsibility.
- Rotation logic in `file-sink.ts` — only add methods; do not restructure `maybeRotate`.

## Git workflow

- Branch: `improve/025-transport-flush-lifecycle` off `main`, after plan 026 merged.
- Conventional commits: `feat(transports): optional flush/close on Transport and flushAll`, `feat(output): file sink flush/close`, `feat(plugin): flush sinks on onStop with flushTimeoutMs`, `docs(adapters): replace manual shutdown snippet`.
- No `Co-Authored-By: Claude` trailer.
- Changeset `.changeset/transport-flush-lifecycle.md`:

  ```markdown
  ---
  'logixlysia': minor
  ---

  Transports may now implement optional `flush()` and `close()`. The plugin flushes every transport and the file sink when the Elysia app stops, bounded by the new `config.flushTimeoutMs` (default 5000 ms; `0` disables waiting). A timeout is reported through `config.onError` with `sink: 'shutdown'`. `flushLogixlysia(options)` is exported for callers who need to drain (and optionally close) sinks outside the Elysia lifecycle.
  ```

- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Types

In `src/types/config.ts`:

1. Add to `Transport` (both optional), with the doc comments from the spike's §1:

   ```ts
     flush?: () => void | Promise<void>
     close?: () => void | Promise<void>
   ```

2. Add `'shutdown'` to `SinkErrorContext['sink']`.

3. Add to `OutputConfig`:

   ```ts
     /**
      * How long the plugin waits for transports and the file sink to flush
      * when the app stops. `0` starts the flush but does not wait.
      * @default 5000
      */
     flushTimeoutMs?: number
   ```

**Verify**: `bun run typecheck` → exit 0 (nothing reads the new fields yet).

### Step 2: File sink `flush()` / `close()` and a bulk helper

In `src/output/file-sink.ts`:

1. Extend the `FileSink` interface with `flush: () => Promise<void>` and `close: () => Promise<void>` (required — logixlysia owns both sides).

2. Replace the comment at line 178 with:

   ```ts
     async flush(): Promise<void> {
       // Awaits the same chain flushBatch() work is serialized onto; a batch
       // still waiting in the microtask at call time is picked up because
       // the microtask runs before this await resumes.
       await Promise.resolve()
       await this.flushChain
     }

     async close(): Promise<void> {
       await this.flush()
       const { handle } = this
       this.handle = null
       await handle?.close()
       sinks.delete(this.filePath)
     }
   ```

   The `await Promise.resolve()` matters: `write()` defers chaining onto `flushChain` with `queueMicrotask`, so a `flush()` issued synchronously after a `write()` must yield once before reading the chain.

3. Add after `getFileSink`:

   ```ts
   export const flushAllFileSinks = async (): Promise<void> => {
     await Promise.allSettled([...sinks.values()].map(sink => sink.flush()))
   }

   export const closeAllFileSinks = async (): Promise<void> => {
     await Promise.allSettled([...sinks.values()].map(sink => sink.close()))
   }
   ```

**Verify**: create `__tests__/output/file-sink-lifecycle.test.ts` (model after `__tests__/output/interval-rotation.test.ts` for temp-dir handling) with:

- `'flush() resolves after a write issued in the same tick is on disk'`: `getFileSink(path).write(line, {})` without awaiting, then `await sink.flush()`, then `readFile` → contains the line.
- `'close() releases the handle and a later write reopens the file'`: write, `await close()`, `getFileSink(path)` returns a *new* instance (`!==`), write again, flush, file contains both lines.
- `'close() is idempotent'`: call twice; no throw.
- `'flushAllFileSinks() drains every registered sink'`: two paths, one write each unawaited, `await flushAllFileSinks()`, both files contain their line.

`cd packages/logixlysia && bun test __tests__/output/file-sink-lifecycle.test.ts` → 4 pass.

### Step 3: In-flight tracking and `flushAll` in `output/index.ts`

Add (module level, above `logToTransports`):

```ts
const MAX_TRACKED_PENDING = 1024
const pendingTransportWork = new Set<Promise<unknown>>()

const track = (promise: Promise<unknown>): void => {
  if (pendingTransportWork.size >= MAX_TRACKED_PENDING) {
    const oldest = pendingTransportWork.values().next().value
    if (oldest) {
      pendingTransportWork.delete(oldest)
    }
  }
  pendingTransportWork.add(promise)
  promise.finally(() => pendingTransportWork.delete(promise)).catch(() => undefined)
}
```

In `logToTransports`, where the returned promise gets `.catch(reportTransportError)`, keep that and additionally `track(result as Promise<unknown>)` (track the original promise, not the caught one, so a rejection is still observed by the catch you attached).

Add exports:

```ts
export const flushTransports = async (options: Options): Promise<void> => {
  const transports = options.config?.transports ?? []
  const onError = options.config?.onError
  await Promise.allSettled([
    ...pendingTransportWork,
    ...transports.map(transport =>
      Promise.resolve()
        .then(() => transport.flush?.())
        .catch(error => reportTransportError(error, onError))
    )
  ])
}

export const closeTransports = async (options: Options): Promise<void> => {
  const transports = options.config?.transports ?? []
  const onError = options.config?.onError
  await Promise.allSettled(
    transports.map(transport =>
      Promise.resolve()
        .then(() => transport.close?.())
        .catch(error => reportTransportError(error, onError))
    )
  )
}
```

Create `src/output/shutdown.ts` with `raceWithTimeout(work, ms): Promise<boolean>` and `reportShutdownTimeout(onError, timeoutMs)` exactly as written in the spike's §4 (timeout → `true`; `ms <= 0` → resolve `true` immediately after attaching a no-op catch; timer `unref`'d; `onError({ error, sink: 'shutdown' })` XOR one `console.error`). Also export:

```ts
export const flushAll = async (options: Options): Promise<void> => {
  await Promise.allSettled([flushTransports(options), flushAllFileSinks()])
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 4: `onStop` hook and manual export in `src/index.ts`

1. Import `flushAll`, `raceWithTimeout`, `reportShutdownTimeout` from `./output/shutdown` (and `closeTransports` / `closeAllFileSinks` for the manual export).

2. After `.onStart(...)`, add:

   ```ts
       .onStop(async () => {
         const timeoutMs = options.config?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
         const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
         if (timedOut) {
           reportShutdownTimeout(options.config?.onError, timeoutMs)
         }
       })
   ```

   with `const DEFAULT_FLUSH_TIMEOUT_MS = 5000` near the top of the file.

3. Add a public function and export it from the barrel:

   ```ts
   /**
    * Drains every transport and file sink; with `close: true` also releases
    * them. For processes that stop without Elysia's `onStop` (workers,
    * scripts, custom signal handlers). Idempotent.
    */
   export const flushLogixlysia = async (
     options: Options,
     { close = false }: { close?: boolean } = {}
   ): Promise<void> => {
     await flushAll(options)
     if (close) {
       await Promise.allSettled([closeTransports(options), closeAllFileSinks()])
     }
   }
   ```

   `options` is the same object passed to `logixlysia(...)` (raw or resolved both work because only `config.transports`/`onError` are read). If plan 024 landed, update the API snapshot (`bun test --update-snapshots __tests__/api`) and confirm the diff is exactly `+flushLogixlysia` on `"."`.

**Verify**: `bun run typecheck` → exit 0. `cd packages/logixlysia && bun run build` → succeeds.

### Step 5: Plugin shutdown tests

Create `__tests__/plugin/shutdown.test.ts`:

- `'onStop flushes transports that implement flush'`: transport `{ log: () => undefined, flush: mock(() => Promise.resolve()) }`; `const app = new Elysia().use(logixlysia({ config: { disableInternalLogger: true, disableFileLogging: true, transports: [t] } }))`; `app.listen(0)`; `await app.stop()`; then `await` a short deferred (the spike showed `app.stop()` does not await async hooks — poll up to 200 ms for the mock to have been called); assert `flush` called once.
- `'onStop tolerates transports without flush'`: transport with only `log`; stop; no throw.
- `'onStop reports a timeout through onError with sink shutdown'`: `flush` returns a never-resolving promise; `flushTimeoutMs: 20`; `onError: mock()`; stop; poll; assert `onError` called with `expect.objectContaining({ sink: 'shutdown' })` and `console.error` NOT called (use `spyConsole(['error'])`).
- `'onStop with flushTimeoutMs 0 does not wait'`: never-resolving flush; `flushTimeoutMs: 0`; measure that `app.stop()` plus a 10 ms poll finishes without `onError` being called.
- `'flushLogixlysia drains the file sink and closes on request'`: `logFilePath` in a temp dir; handle one request; `await flushLogixlysia(options, { close: true })`; file contains the access line; `getFileSink(path)` returns a fresh instance.

If `app.listen(0)` is unavailable in the test environment (no server), the spike confirmed `onStop` fires from `app.stop()` only after `listen`; if `listen` cannot bind in CI, fall back to invoking the hook via `app.stop()` after `app.listen({ port: 0 })` and report which form works.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/shutdown.test.ts` → 5 pass; run it three times to check for flakiness.

### Step 6: Docs

- `apps/docs/content/adapters/overview.mdx` "Graceful Shutdown": replace the hand-rolled snippet with: the plugin flushes automatically on `app.stop()`, bounded by `flushTimeoutMs`; what is NOT covered (SIGKILL; a process that exits without calling `app.stop()`; serverless freeze); and a short snippet showing `process.on('SIGTERM', async () => { await app.stop(); process.exit(0) })` plus `flushLogixlysia(options, { close: true })` for scripts.
- `apps/docs/content/configuration.mdx`: add `flushTimeoutMs` next to `onError`, and `'shutdown'` to the documented `sink` values.
- `apps/docs/content/features/transports.mdx`: in the custom transport section, mention the optional `flush`/`close` members and when to implement them.

**Verify**: `grep -rn "flushTimeoutMs" apps/docs/content | wc -l` → ≥ 2; `grep -n "SIGTERM" apps/docs/content/adapters/overview.mdx` → still present (in the reduced snippet).

### Step 7: Changeset, format, full gate

**Verify**: `bun run format && bun run lint && bun run typecheck && cd packages/logixlysia && bun test` → all exit 0.

## Test plan

- `__tests__/output/file-sink-lifecycle.test.ts` (4 tests) — pattern: `interval-rotation.test.ts`.
- `__tests__/plugin/shutdown.test.ts` (5 tests) — pattern: `plugin/logixlysia.test.ts` for app construction, `_helpers/console.ts` for stderr assertions, `_helpers/tmp.ts` for files.
- Existing adapter tests remain green (adapters gain nothing new here).

## Done criteria

- [ ] `grep -n "onStop" packages/logixlysia/src/index.ts` → one hook
- [ ] `grep -n "see plans/020" packages/logixlysia/src/output/file-sink.ts` → no match
- [ ] `grep -n "'shutdown'" packages/logixlysia/src/types/config.ts` → present in `SinkErrorContext`
- [ ] `node -e "import('./packages/logixlysia/dist/index.js').then(m=>console.log(typeof m.flushLogixlysia))"` prints `function`
- [ ] `cd packages/logixlysia && bun test` exits 0, 9 new tests
- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] Docs updated in the three files listed
- [ ] `.changeset/transport-flush-lifecycle.md` exists
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 026 has not merged (`adapters/shared.ts` `flush()` does not await a send tail).
- `Elysia` in the installed version has no `.onStop` (check `node_modules/elysia/package.json` version and `grep -n "onStop" node_modules/elysia/dist/index.d.ts`).
- `app.stop()` in tests throws because no server was started and `listen(0)` cannot bind — report rather than mocking Elysia internals.
- Adding `.onStop` changes the plugin's inferred type so that `LogixlysiaPlugin` no longer typechecks in `apps/elysia` (the `@ts-expect-error` at `index.ts:197` may need re-evaluating; report the exact error).

## Maintenance notes

- The draft PR #371 (Elysia 2 beta) may change hook semantics; the shutdown test file is the canary.
- `pendingTransportWork` is process-wide by design (spike §2). Two plugin instances share it; that is intended.
- Reviewer focus: `onError` XOR stderr on timeout (never both); `close` is never called automatically; `flushTimeoutMs: 0` really does not block.
- Deferred: `close()` on the built-in adapters (clear timers) — trivial but out of scope; direction backlog item "transport middleware" may reshape it.
