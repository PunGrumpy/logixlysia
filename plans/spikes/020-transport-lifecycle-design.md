# Spike 020: Transport `flush()`/`close()` lifecycle design

**Status:** Decided (recommendation for maintainer sign-off)
**Date:** 2026-08-10
**Commit stamp:** evidence gathered at `origin/main` = `9fccb4a`

## Context

Logixlysia's delivery contract today is "best effort, fire-and-forget":

- `FileSinkImpl.write` batches lines via `pendingBatch` + `queueMicrotask`
  and serializes them onto a `flushChain` promise
  (`packages/logixlysia/src/output/file-sink.ts:37-73`), but nothing outside
  the class ever awaits that chain to completion on shutdown.
- `logToTransports` (`packages/logixlysia/src/output/index.ts:42-79`) calls
  `transport.log(...)`, and if it returns a promise, only attaches
  `.catch(reportTransportError)` (lines 66-74) — the promise itself is
  never awaited or tracked anywhere.
- `Transport` (`packages/logixlysia/src/types/config.ts:4-10`) is a single
  `log` method. There is no way for a batching/HTTP transport (a Loki,
  Datadog, or OTLP shipper that queues entries and ships them in batches)
  to be told "drain your queue now," and no shutdown hook at all — on
  process exit, the tail of the log stream (the batch still sitting in
  `pendingBatch`, or a transport's in-memory queue) is silently lost.
- There is already an aspirational comment marking this exact gap:
  `packages/logixlysia/src/output/file-sink.ts:148`:
  ```
  // see plans/020: flush()/close() lifecycle would await `flushChain` here.
  ```

This spike decides the lifecycle API before anyone builds it. Implementation
is a follow-up PR the maintainer approves separately (see Non-goals).

## Step 1: Shutdown-hook mechanics (scratch evidence)

**Elysia version:** `1.4.29` (installed; `bun.lock:1291`,
`elysia@1.4.29`), against the package's declared peer range `^1.4.28`
(`packages/logixlysia/package.json:62,66`). Bun `1.3.14`.

**Setup:** three scratch scripts under `/tmp/spike-020/` (never committed),
each building a plugin the same shape as the real one
(`new Elysia({ name: '...' }).onStop(...)`, mirroring
`packages/logixlysia/src/index.ts:102-193`), `.use()`d by a consumer app.

### (a) Does the plugin's `onStop` fire when the consuming app stops? — Yes, in both scoping modes

`test1-onstop-scoped.ts` (plugin built `.as('scoped')`, matching
`src/index.ts:193`) and `test2-onstop-unscoped.ts` (identical, no
`.as('scoped')`) both call `app.listen(0)` then `await app.stop()`.

Raw output, scoped:

```
[scoped] plugin onStart fired
[scoped] app listening on 31845
[scoped] plugin onStop FIRED, starting 200ms async work...
[scoped] app.stop() resolved after 3 ms
[scoped] asyncOnStopStarted = true
[scoped] asyncOnStopFinished (at the moment app.stop() resolved) = false
[scoped] CONCLUSION: app.stop() does NOT await the plugin async onStop hook (resolved before async work finished)
[scoped] plugin onStop async work FINISHED
```

Raw output, unscoped:

```
[unscoped] plugin onStart fired
[unscoped] app listening on 31839
[unscoped] plugin onStop FIRED, starting 200ms async work...
[unscoped] app.stop() resolved after 3 ms
[unscoped] asyncOnStopFinished (at the moment app.stop() resolved) = false
[unscoped] plugin onStop async work FINISHED
```

**Finding:** `onStop` fires in both cases — scoping does not gate hook
propagation for `onStop` in this version. The crux question in the plan
("does scoping affect hook propagation") is answered: **no**, not for this
hook, in this Elysia version.

### (b) Is an async `onStop` awaited by `app.stop()`? — No

Both runs above show `app.stop()` resolving in **3ms**, while the plugin's
200ms async `onStop` body is still in flight (`asyncOnStopFinished = false`
at the moment `app.stop()` resolves; the "FINISHED" log line prints
*after* the `CONCLUSION` line, i.e. after the script's own `main()` has
already moved on). **`app.stop()` fires `onStop` but does not wait for it
to settle.** This is the single most consequential finding for this
design — see "Wiring" below.

### (c) SIGINT with no listener registered — process dies, `onStop` never runs

`test3-sigint.ts` starts a plugin identical to (a)/(b) (with a synchronous
`onStop` that writes a marker file, chosen so the effect is observable even
if the process dies before stdout flushes), with **no**
`process.on('SIGINT', ...)` registered anywhere. The process was started
in the background, then sent `SIGINT` via `kill -SIGINT <pid>` after it
was confirmed listening.

Raw output/observations:

```
stdout: "[sigint] pid 17074 listening on 32501"
(no further output after SIGINT)
process exit code: 130   (= 128 + SIGINT, i.e. the default OS-level kill)
marker file /tmp/spike-020/sigint-onstop-fired.txt: does not exist
```

**Finding:** a bare Bun process with no signal handler dies immediately on
`SIGINT` (exit 130, the raw OS default) — Elysia does not install a default
`SIGINT`→`onStop` bridge, and `onStop` never runs. Ctrl-C on a default
setup is data loss for anything relying on `onStop` alone.

### Interpretation

The spike's core premise holds and is confirmed empirically, not assumed:
- `onStop` is a real, reachable hook (rules out the STOP-condition fallback
  of a manual-only `flush()` API — the hook exists and works).
- But `onStop` firing is **necessary, not sufficient**, for a caller that
  does `await app.stop(); process.exit()` — since `app.stop()` doesn't wait
  for it, an immediate `process.exit()` after `await app.stop()` can still
  cut off in-flight flush work started by `onStop`. This shapes the "Wiring"
  recommendation below (a `Promise.race` timeout run *inside* `onStop`
  reduces the window but cannot make Elysia itself synchronous).
- `SIGINT`/Ctrl-C without an app-level signal handler is entirely outside
  `onStop`'s reach. This is recorded as an explicit non-covered case, not
  silently assumed away.

## Design

### 1. API: `Transport.flush()` / `Transport.close()`

Add two optional methods to `Transport`
(`packages/logixlysia/src/types/config.ts:4-10`), fully backward
compatible — both optional, absent means no-op, so every existing
`Transport` implementation in the wild keeps compiling and behaving
identically:

```ts
export interface Transport {
  log: (
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ) => void | Promise<void>
  /**
   * Drain any queued/batched entries. Called during graceful shutdown
   * (see `OutputConfig.flushTimeoutMs`) and may also be called directly by
   * user code (e.g. before a serverless function is frozen). Optional:
   * omit when the transport already writes synchronously/durably inside
   * `log()` and has nothing to drain. Errors thrown or rejected here are
   * reported the same way `log()` errors are (`config.onError` or
   * rate-limited stderr) and do not stop other transports from flushing.
   */
  flush?: () => void | Promise<void>
  /**
   * Flush, then release any held resources (sockets, timers, buffers).
   * Optional: omit when there is nothing to release. Must be idempotent —
   * logixlysia may invoke it more than once across a process's lifetime
   * (see "Wiring": the plugin's automatic `onStop` hook only calls
   * `flush()`, never `close()` — `close()` is opt-in, invoked by whatever
   * manual shutdown path the follow-up implementation exports). After
   * `close()` resolves, a well-behaved transport should treat any further
   * `log()` call as a no-op/drop rather than throwing.
   */
  close?: () => void | Promise<void>
}
```

### 2. In-flight tracking

`logToTransports` (`output/index.ts:42-79`) currently does
`(result as Promise<void>).catch(...)` and forgets the promise. Change:
keep a **single module-level bounded `Set<Promise<unknown>>`** in
`output/index.ts` (in-flight `log()` calls across *all* plugin instances in
the process — logging is process-wide I/O pressure regardless of which
`logixlysia()` call produced it, so a single shared tracker is the simplest
correct model; there is no per-instance isolation requirement here).

```ts
const MAX_TRACKED_PENDING = 1024
const pendingTransportWork = new Set<Promise<unknown>>()

const track = (promise: Promise<unknown>): void => {
  if (pendingTransportWork.size >= MAX_TRACKED_PENDING) {
    // Overflow: stop tracking the oldest entry (Set preserves insertion
    // order) rather than growing unbounded or rejecting new log calls.
    // Honest tradeoff: under sustained backpressure from a transport that
    // can't keep up (>1024 concurrent in-flight `log()` promises), the
    // oldest untracked promises won't be awaited by flushAll() — a flush
    // during shutdown can resolve before they finish. This only triggers
    // under an operational problem (a transport falling behind by 1024+
    // in-flight calls) that is itself worth fixing independently of this
    // feature; it is not a silent correctness gap in the common case.
    const oldest = pendingTransportWork.values().next().value
    if (oldest) {
      pendingTransportWork.delete(oldest)
    }
  }
  pendingTransportWork.add(promise)
  promise.finally(() => pendingTransportWork.delete(promise))
}
```

Inside `logToTransports`, wrap the existing `.catch()` attachment with
`track(...)` instead of leaving the promise untracked.

`flushAll(options)` (new export, `output/index.ts`):

```ts
export const flushAll = async (options: Options): Promise<void> => {
  const transports = options.config?.transports ?? []
  await Promise.allSettled([
    ...pendingTransportWork,               // live set, snapshotted by spread
    ...transports.map(t => t.flush?.()),
    flushAllFileSinks()                     // see §3
  ])
}
```

Spreading `pendingTransportWork` takes a snapshot at call time (new `log()`
calls that start *during* the flush are not waited on — shutdown is a
point-in-time drain of what's already in flight, not a barrier that blocks
new work; the plugin should already have stopped accepting new requests by
the time `onStop` runs).

### 3. File sink: `flush()` / `close()`

`FileSinkImpl` (`output/file-sink.ts:32-149`) gets two new public methods,
replacing the aspirational comment at line 148:

```ts
async flush(): Promise<void> {
  // Awaits the same chain flushBatch() work is already serialized onto
  // (field declared file-sink.ts:41) — no new synchronization primitive.
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

Both are naturally **idempotent**: a second `flush()` awaits an
already-resolved chain; a second `close()` sees `this.handle === null` (so
`handle?.close()` is a no-op) and `sinks.delete` on an already-removed key
is a no-op. `write()` after `close()` is not special-cased — it will
transparently reopen the file (via `ensureOpen`) on the next line, which is
correct: `getFileSink(path)` returns the *same* still-Map-registered
instance only if `close()` hasn't run; once `close()` removes it from
`sinks`, the next `getFileSink(path)` call constructs a fresh
`FileSinkImpl`, which is the right behavior for a sink that's meant to be
gone.

`FileSink` (the exported interface, `file-sink.ts:17-20`) grows matching
optional-free (these are load-bearing, not optional, since logixlysia
controls both sides of this interface — unlike `Transport`, which is
implemented by third parties) signatures:

```ts
export interface FileSink {
  write: (line: string, options: FileSinkOptions) => Promise<void>
  flush: () => Promise<void>
  close: () => Promise<void>
}
```

A module-level bulk helper, since `sinks` (`file-sink.ts:151`) is a
process-wide `Map<string, FileSink>` shared by every plugin instance
pointed at the same `logFilePath`:

```ts
export const flushAllFileSinks = async (): Promise<void> => {
  await Promise.allSettled([...sinks.values()].map(s => s.flush()))
}
```

No `closeAllFileSinks()` is wired into the automatic shutdown path — see
"Wiring" for why `close()` is deliberately not auto-invoked.

### 4. Wiring

**The plugin's `onStop` hook flushes; it never closes, automatically.**
Rationale: `sinks` (file-sink.ts:151) is a **process-wide** Map keyed by
path, not owned by any one plugin instance. If a process has two
`logixlysia()` instances pointed at the same `logFilePath` (or, more
subtly, if a single instance's `onStop` fired while a second instance was
still mid-request), an automatic `close()` would pull the file handle out
from under a sibling that's still writing. `flush()` has no such hazard —
draining the queue is always safe to do redundantly and concurrently.
`close()` is therefore part of the API (§1, §3) but deliberately **opt-in**:
the follow-up implementation PR should export a manual top-level function
(e.g. `flushLogixlysia()`/a `logger.close()` method) for callers who know
they own the whole process and want a hard release before exit — building
that export is out of scope for this spike (see Non-goals) but its shape
should reuse `flushAll`/`flushAllFileSinks`/`closeAllFileSinks` internally.

`src/index.ts`, alongside the existing `.onStart(...)` (line 117):

```ts
.onStop(async () => {
  const timeoutMs = options.config?.flushTimeoutMs ?? 5000
  const timedOut = await raceWithTimeout(flushAll(options), timeoutMs)
  if (timedOut) {
    reportShutdownTimeout(options.config?.onError, timeoutMs)
  }
})
```

`raceWithTimeout` (new helper, `output/index.ts` or a small
`output/shutdown.ts`):

```ts
const raceWithTimeout = (work: Promise<unknown>, ms: number): Promise<boolean> => {
  if (ms <= 0) {
    // flushTimeoutMs: 0 opts out of blocking shutdown on flush entirely —
    // the flush still starts (best effort if the loop stays alive), but
    // onStop resolves immediately.
    work.catch(() => {})
    return Promise.resolve(true)
  }
  return new Promise(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve(true)
      }
    }, ms)
    timer.unref?.()
    work.then(
      () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(false)
        }
      },
      () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(false) // allSettled inside flushAll already swallows individual failures
        }
      }
    )
  })
}
```

**`onError` routing for the timeout: route through `onError` when present,
else stderr — not both.** This matches the existing precedent set by
`reportTransportError` (`output/index.ts:12-30`) and `reportSinkError`
(`output/file.ts:42-59`): both existing sink-error reporters do `onError`
**XOR** a stderr fallback, never both. Introducing a "do both" behavior
just for shutdown would be a new, inconsistent convention for no clear
benefit — a maintainer who wired `onError` clearly wants failures routed
through their own observability pipeline, not also duplicated to stderr.
This requires a new `SinkErrorContext['sink']` variant,
`'shutdown'`, alongside the existing `'file' | 'rotation' | 'transport'`
(`types/config.ts:50-54`):

```ts
export interface SinkErrorContext {
  error: unknown
  sink: 'file' | 'rotation' | 'transport' | 'shutdown'
}
```

```ts
const reportShutdownTimeout = (
  onError: ((context: SinkErrorContext) => void) | undefined,
  timeoutMs: number
): void => {
  const error = new Error(
    `[logixlysia] shutdown flush did not complete within ${timeoutMs}ms; some transport/file writes may not have been durably flushed.`
  )
  if (onError) {
    try {
      onError({ error, sink: 'shutdown' })
    } catch {
      // Swallow errors thrown by the hook itself, matching every other sink reporter.
    }
    return
  }
  console.error(error.message)
}
```

**What this does NOT cover** (explicitly, so the follow-up PR and the docs
don't overclaim):

- **`SIGKILL`** — un-catchable by any process; no hook of any kind runs.
- **Serverless freeze without a stop event** (e.g. a FaaS runtime that
  freezes the process between invocations without calling `app.stop()`
  or sending a signal) — `onStop` never fires; a frozen-mid-batch queue
  stays queued until (if ever) a thaw + a later invocation's traffic
  drains it via the normal write path, or the instance is recycled and the
  queue is lost.
- **`process.exit()` called immediately after `await app.stop()`** — per
  Step 1(b), `app.stop()` does not wait for the plugin's `onStop` to
  settle, so `onStop`'s internal `Promise.race`/timeout logic is itself
  racing against however much event-loop time the caller's own code gives
  it after `app.stop()` resolves. If the caller's next line is
  `process.exit()`, the flush may be cut off well before `flushTimeoutMs`
  elapses, regardless of the timeout value. This is a real, documented gap
  — not fixable from inside the plugin, since Elysia's own `app.stop()`
  contract doesn't wait (see Open Question 1 for a mitigation).
- **`SIGINT`/Ctrl-C on a default Bun process with no app-level signal
  handler** — per Step 1(c), the process dies immediately (exit 130,
  `onStop` never runs). Graceful drain on Ctrl-C requires the *consuming
  application* to register its own `process.on('SIGINT', () =>
  app.stop())` (or equivalent) — logixlysia cannot install a process-wide
  signal handler itself without risking clobbering a handler the host app
  already has.

### 5. Delivery contract doc

Add a new section to `apps/docs/content/features/transports.mdx`, after
"Basic Transport" (currently ends at line 41) and before "External
Services" (currently starts at line 43):

```mdx
## Delivery Contract

Logixlysia's logging is **at-most-once and best-effort** — it optimizes
for never blocking or slowing down request handling, not for guaranteed
delivery:

- `log()` calls to transports and the file sink are never awaited on the
  request path; a slow or failing transport cannot delay a response.
- On graceful shutdown (the host app calling `app.stop()`, or an
  equivalent lifecycle event the app wires up itself), logixlysia attempts
  to drain everything already queued: it calls `flush()` on every
  transport that implements it, and flushes any buffered file writes, with
  a bounded wait (`config.flushTimeoutMs`, default 5000ms). If the drain
  doesn't finish in time, logixlysia reports which sinks may not have
  fully flushed (via `config.onError` if set, else stderr) and moves on —
  it does not hang shutdown indefinitely.
- This bounded drain only runs when a shutdown hook actually fires. It is
  **not** a guarantee against process kills (`SIGKILL`), an immediate
  `process.exit()` called right after `app.stop()`, or a serverless
  runtime freezing the process without a stop event. For those cases,
  anything still queued is lost — implement your own retry/durability in
  the transport itself if you need it (e.g. write-ahead to disk before
  shipping over the network).

Implement `flush()`/`close()` on a `Transport` if it batches or buffers
entries internally (e.g. a Loki/Datadog/OTLP shipper); leave them
undefined if `log()` already writes durably/synchronously.
```

### 6. Config: `flushTimeoutMs`

`OutputConfig` (`types/config.ts:97-114`):

```ts
export interface OutputConfig {
  disableFileLogging?: boolean
  disableInternalLogger?: boolean
  /**
   * Maximum time (ms) to wait, on graceful shutdown, for `flush()` across
   * all sinks (transports + the file sink) before giving up and reporting
   * whichever sinks may not have fully drained (via `onError`, sink:
   * 'shutdown', or stderr if `onError` is unset). Set to `0` to start the
   * flush without blocking shutdown on it at all.
   * @default 5000
   */
  flushTimeoutMs?: number
  /** Directory mode for created log directories. @default 0o700 */
  logDirMode?: number
  /** File mode for created log files. @default 0o600 */
  logFileMode?: number
  logFilePath?: string
  logRotation?: LogRotationConfig
  /**
   * Called when a sink (transport, file, rotation, shutdown) fails.
   * Errors thrown by the hook itself are swallowed. When absent, failures
   * go to stderr (rate-limited for transports).
   */
  onError?: (context: SinkErrorContext) => void
  transports?: Transport[]
  useTransportsOnly?: boolean
}
```

(Note the small accompanying doc-comment fix on `onError`: "transport,
file, rotation" becomes "transport, file, rotation, shutdown" to keep the
comment truthful once `'shutdown'` exists on `SinkErrorContext['sink']`.)

### 7. Non-goals

- **Building an actual batching transport** (Loki/Datadog/OTLP shipper).
  This spike only defines the interface such a transport could implement;
  none ships as part of this work.
- **Retry/backoff** for failed `log()`/`flush()` calls. A transport that
  wants retries implements it internally; logixlysia does not add a
  generic retry wrapper.
- **Delivery guarantees beyond a bounded graceful drain.** No
  write-ahead log, no persistent queue, no "at-least-once" semantics. See
  the "What this does NOT cover" list in §4 and the Delivery Contract
  wording in §5 — both are deliberately unhedged about this.
- **A manual top-level `flushLogixlysia()`/`logger.close()` export.** The
  API surface for it is sketched in §4 (it should reuse `flushAll` /
  `flushAllFileSinks` / a not-yet-written `closeAllFileSinks`) but writing
  and shipping that export is left to the implementation PR — see Open
  Question 1 for why it's likely to be needed, not just nice-to-have.
- **A process-wide `SIGINT`/`SIGTERM` handler installed by logixlysia
  itself.** Per Step 1(c), the plugin cannot rely on Elysia to bridge
  signals to `onStop`; installing its own global signal handler risks
  clobbering one the host application already has, which is worse than
  leaving it to the host. Signal wiring stays the host app's
  responsibility; the docs (§5) should say so plainly rather than implying
  logixlysia handles Ctrl-C for you.

### 8. Test plan for the implementation PR

- **Transport `flush()` drains a slow async transport**: a `Transport`
  whose `log()` pushes into an internal array and whose `flush()` awaits a
  `setTimeout`-delayed batch send; assert `flushAll(options)` resolves only
  after the batch send completes and the transport observed all queued
  entries.
- **`close()` is idempotent**: call `close()` twice on the same
  `FileSinkImpl` (and on a test `Transport` implementing `close()`);
  assert neither call throws and the second is a true no-op (no second
  `handle.close()` syscall — spy/mock the handle).
- **`log()` after `close()` is dropped, not thrown**: for the file sink,
  write after `close()` and assert it transparently reopens (per §3) with
  a fresh handle rather than erroring; for a `Transport`, assert
  logixlysia itself does not call `log()` again after `close()` within the
  same shutdown sequence (it doesn't today — `close()` is only reachable
  from the not-yet-built manual export, never from `onStop`).
- **Timeout fires and warns**: a `Transport.flush()` that never resolves,
  `flushTimeoutMs` set low (e.g. `10`); assert `onStop` reports via
  `onError({ sink: 'shutdown' })` when `onError` is configured, and via a
  `console.error` spy when it isn't — never both in the same run.
- **`onStop` propagation (integration)**: build a plugin the same shape as
  `src/index.ts`, `.use()` it into a host app, call `app.stop()`, and
  assert the `onStop` hook fired (mirrors Step 1(a)/(b) but as a
  permanent regression test rather than throwaway scratch — pin the
  observed "not awaited by `app.stop()`" behavior with a real test so a
  future Elysia upgrade that changes it is caught, not silently trusted).
- **File sink `flush()` awaits queued batches**: write several lines in
  the same microtask (so they land in one `pendingBatch`,
  file-sink.ts:52-72), call `flush()` immediately, and assert it resolves
  only after the batched `handle.write()` actually completed (spy the
  handle to add an artificial delay and assert ordering, not just that it
  eventually resolves).
- **Bounded pending-set overflow**: push `MAX_TRACKED_PENDING + 1` never-
  resolving `log()` promises through `logToTransports`, assert the tracked
  `Set` size never exceeds the cap, and assert `flushAll()` still resolves
  (doesn't hang waiting on an unbounded set) — documenting the overflow
  tradeoff from §2 as a test, not just prose.

### 9. Open questions for the maintainer

1. **Should logixlysia export a manual `flushLogixlysia()` (or
   `logger.flush()`/`logger.close()`) callers can explicitly `await`
   themselves?** Per Step 1(b), `app.stop()` does not wait for the
   plugin's own `onStop`, so a caller doing
   `await app.stop(); process.exit()` gets no real guarantee from the
   automatic hook alone. **Recommendation: yes, export it** — it's nearly
   free (it wraps the same `flushAll`/`flushAllFileSinks` this design
   already builds) and it's the only path that gives callers something
   they can genuinely `await` before their own `process.exit()`, rather
   than trusting Elysia's internals. Building it is scoped to the
   follow-up PR (§7), but the maintainer should confirm this is wanted
   before that PR starts, since it's the one piece of public API surface
   beyond what the plan originally asked this spike to decide.
2. **New `SinkErrorContext['sink']` value `'shutdown'`, or reuse
   `'transport'`?** **Recommendation: add `'shutdown'`** (§4) — a shutdown
   timeout is categorically different from a single transport's `log()`
   failure (it can implicate the file sink too, not just transports), and
   overloading `'transport'` would make `onError` handlers that branch on
   `sink` misclassify it.
3. **Is the module-level, process-wide `pendingTransportWork` Set (§2) —
   shared across every `logixlysia()` instance in the process, capped at a
   fixed 1024 — the right scope, or should tracking be per-plugin-instance
   with its own cap?** **Recommendation: keep it process-wide and the cap
   fixed/internal (not user-configurable) for v1.** No user signal exists
   either way (this is a brand-new feature, not an existing pain point
   like spike 021's `interval`), and per-instance tracking adds real
   complexity (threading a tracker handle through `createPluginLogger` /
   `emit.ts` / `logToTransports`) for a benefit — isolating one plugin
   instance's flush from another's in-flight work — that nothing in the
   current codebase's single-process, single-`logixlysia()`-instance-per-
   file-path usage pattern actually needs yet.
