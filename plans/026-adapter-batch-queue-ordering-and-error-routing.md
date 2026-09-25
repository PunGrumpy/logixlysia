# Plan 026: Make the adapter batch queue ordered, flush-complete, and `onError`-aware

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478f40d..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/output/index.ts packages/logixlysia/src/types/config.ts packages/logixlysia/__tests__/adapters/shared.test.ts packages/logixlysia/__tests__/adapters/helpers.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (plan 025 depends on this one)
- **Category**: bug
- **Planned at**: commit `478f40d`, 2026-09-19

## Why this matters

All nine built-in adapters (Axiom, Better Stack, ClickHouse, Datadog, HyperDX, Loki, OTLP, PostHog, Sentry) share one batch queue in `src/adapters/shared.ts`. Three defects in that queue were verified at runtime:

1. **Sends interleave and reorder.** `flush()` swaps the buffer and starts a send with no in-flight guard. A slow first send lets a second batch overtake it, so batches arrive out of order (bad for Loki/Better Stack tailing; some backends reject non-monotonic timestamps per stream) and a slow ingest host produces unbounded concurrent POSTs instead of backpressure.
2. **`flush()` can resolve before earlier sends land.** It is documented as "call before process exit", but it only awaits the batch it started. Plan 025 will call it from the plugin's `onStop`, so it must mean "everything queued so far is delivered or failed".
3. **Timer-driven flush failures bypass `config.onError`.** `push` returns a promise only when the batch fills; otherwise the timer path catches into a bare `console.error`. With defaults (`maxBatchSize: 20`, `flushIntervalMs: 2000`) a low-traffic service takes the timer path for almost every batch, so the documented failure hook never sees the most common failure and stderr gets an unthrottled stack trace every 2 seconds during an outage.

Two smaller issues in `postWithRetry` are fixed in the same file: a 429 is retried after 250 ms ignoring `Retry-After`, and a successful response's body is never consumed or cancelled.

## Current state

Files and roles:

- `packages/logixlysia/src/adapters/shared.ts` — batch queue, `postWithRetry`, `createHttpTransport`, flatten helpers. Every adapter uses `createHttpTransport` (directly, or through `src/adapters/otlp-core.ts:83`).
- `packages/logixlysia/src/output/index.ts` — `logToTransports`: fans a record out to `config.transports`, attaches `.catch(reportTransportError)` to any returned promise.
- `packages/logixlysia/src/types/config.ts` — `Transport` (lines 5–11) and `OutputConfig.onError` (lines 152–157).
- `packages/logixlysia/src/utils/report.ts` — `createErrorReporter(sink, label)`: routes to `onError` when present, else stderr rate-limited to once per 5 s.
- `packages/logixlysia/__tests__/adapters/shared.test.ts` — existing queue and retry tests.
- `packages/logixlysia/__tests__/adapters/helpers.ts` — `stubFetch(responses)` records calls and always resolves a `Response`; `stubEnv`.

`createBatchQueue` today (`shared.ts:166–205`):

```ts
export const createBatchQueue = (input: {
  flushIntervalMs: number
  maxBatchSize: number
  name: string
  send: (entries: LogEntry[]) => Promise<void>
}): BatchQueue => {
  let buffer: LogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (buffer.length === 0) {
      return
    }
    const entries = buffer
    buffer = []
    await input.send(entries)
  }

  const flushFromTimer = (): void => {
    flush().catch(error => {
      console.error(`[logixlysia] ${input.name} transport failed:`, error)
    })
  }

  const push = (entry: LogEntry): Promise<void> | undefined => {
    buffer.push(entry)
    if (buffer.length >= input.maxBatchSize) {
      return flush()
    }
    if (!timer) {
      timer = setTimeout(flushFromTimer, input.flushIntervalMs)
      timer.unref?.()
    }
  }

  return { flush, push }
}
```

`BatchTransportOptions` today (`shared.ts:21–42`): `flushIntervalMs?`, `maxBatchSize?`, `retries?`, `timeout?` — no `onError`.

`createHttpTransport` today (`shared.ts:222–247`): builds the queue with `send: entries => postWithRetry({...})` and returns `{ flush: queue.flush, log: (level, message, meta) => queue.push({...}) }`.

`attemptPost` today (`shared.ts:98–145`), relevant parts:

```ts
  const retryOrRethrow = async (error: Error): Promise<void> => {
    if (attempt >= input.retries) {
      throw error
    }
    await sleep(RETRY_BASE_DELAY_MS * (attempt + 1))
    return attemptPost(input, attempt + 1)
  }
  ...
    response = await fetch(input.url, {
      body: input.body,
      headers: input.headers,
      method: 'POST',
      signal: AbortSignal.timeout(input.timeout)
    })
  ...
  if (response.ok) {
    return
  }
  const detail = (await response.text().catch(() => '')).slice(0, ERROR_BODY_PREVIEW_LENGTH)
  ...
  const retryable =
    response.status === HTTP_TOO_MANY_REQUESTS ||
    response.status >= HTTP_SERVER_ERROR_MIN
  if (!retryable) {
    throw httpError
  }
  return retryOrRethrow(httpError)
```

`logToTransports` today (`output/index.ts:38–52`):

```ts
for (const transport of transports) {
  try {
    const result = transport.log(level, message, meta)
    if (result && typeof (result as { catch?: unknown }).catch === 'function') {
      ;(result as Promise<void>).catch(error =>
        reportTransportError(error, onError)
      )
    }
  } catch (error) {
    reportTransportError(error, onError)
  }
}
```

`reportTransportError` is `createErrorReporter('transport', 'transport failed')` (`output/index.ts:5–8`). The adapters are constructed by the user _before_ the plugin sees `config.onError`, so the adapter cannot reach the plugin's hook unless it is handed one.

Existing timer test (`__tests__/adapters/shared.test.ts:188–206`) uses a real 50 ms sleep:

```ts
  test('flushes on the interval timer', async () => {
    ...
    queue.push(entry())
    await new Promise(resolve => {
      setTimeout(resolve, 50)
    })
    expect(batches).toHaveLength(1)
  })
```

Fake-clock pattern already used in this suite (`__tests__/output/interval-rotation.test.ts:1–17`): `import { setSystemTime } from 'bun:test'` with an `afterEach(() => setSystemTime())` reset. Note `setSystemTime` fakes `Date`, not timers; for timers, keep a real but short interval (≤ 10 ms) and await a deferred promise the fake `send` resolves, instead of sleeping a fixed 50 ms.

Conventions: Biome via `ultracite` (single quotes, no semicolons, no trailing commas). Constants are named `UPPER_SNAKE` at the top of the file (see `RETRY_BASE_DELAY_MS`). No `any`. Tests use `bun:test` `describe`/`test`/`expect`, `mock()` for spies.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Adapter tests | `cd packages/logixlysia && bun test __tests__/adapters` | all pass |
| Full tests | `cd packages/logixlysia && bun test` | all pass |
| Bench (optional) | `bun run bench` | numbers printed; transports suite within noise |

## Scope

**In scope**:

- `packages/logixlysia/src/adapters/shared.ts`
- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `packages/logixlysia/__tests__/adapters/helpers.ts` (extend `stubFetch`)
- `apps/docs/content/adapters/overview.mdx` (one paragraph documenting `onError` on adapter options, if you add the option there — see Step 3)
- `.changeset/<slug>.md`
- `plans/README.md`

**Out of scope**:

- The nine adapter files (`src/axiom.ts`, …) and `src/adapters/otlp-core.ts` — they pass `options` straight through to `createHttpTransport`, so a new optional field on `BatchTransportOptions` reaches them without edits. Do not touch them.
- `src/desertant.ts` — its queue is separate and correct.
- Plugin shutdown / `onStop` — plan 025.
- `Transport` interface changes — plan 025.

## Git workflow

- Branch: `improve/026-adapter-batch-queue` off `main`.
- Conventional commits: `fix(adapters): serialize batch sends and make flush await in-flight work`, `fix(adapters): route timer flush failures through onError`, `fix(adapters): honor Retry-After and release response bodies`, `test(adapters): …`.
- No `Co-Authored-By: Claude` trailer.
- Changeset `.changeset/adapter-batch-queue.md`:

  ```markdown
  ---
  'logixlysia': patch
  ---

  Built-in adapters now deliver batches in order (one in-flight send at a time), `flush()` waits for every batch queued before it, and timer-driven flush failures are reported through the transport's `onError` option instead of an unthrottled `console.error`. `postWithRetry` honors `Retry-After` on 429 (capped at 30 s) and releases successful response bodies.
  ```

- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Serialize sends and make `flush()` complete

In `createBatchQueue`, add a promise tail so every send chains onto the previous one, and make `flush()` await the tail:

```ts
let tail: Promise<void> = Promise.resolve()

const enqueueSend = (entries: LogEntry[]): Promise<void> => {
  const send = tail.then(() => input.send(entries))
  // Keep the chain alive after a failure; the caller of enqueueSend sees the rejection.
  tail = send.catch(() => undefined)
  return send
}

const flush = (): Promise<void> => {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (buffer.length === 0) {
    return tail
  }
  const entries = buffer
  buffer = []
  const send = enqueueSend(entries)
  // flush() resolves only once this batch AND everything before it has settled.
  return send.then(() => tail)
}
```

Semantics to preserve: `push` still returns the send promise only when the batch fills (callers attach `.catch`); a rejected send must not poison later sends (hence `tail = send.catch(...)`); `flush()` on an empty buffer must still wait for in-flight work.

Add a bound so a dead backend cannot grow memory without limit: a constant `DEFAULT_MAX_PENDING_BATCHES = 32`; count batches queued-but-not-settled; when a new batch would exceed it, drop the batch and report it through the queue's error reporter (Step 3) with a message like `` `[logixlysia] ${name} transport: ${n} batches pending; batch of ${entries.length} dropped` ``. Expose the bound as `BatchTransportOptions.maxPendingBatches?` with `@default 32`.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Tests for ordering and flush completeness

In `__tests__/adapters/shared.test.ts`, add to the `createBatchQueue` describe:

- `'delivers batches in order when a send is slow'`: `maxBatchSize: 2`; `send` returns a deferred promise for the first call and resolves immediately for later ones; push 4 entries; resolve the first deferred; await `queue.flush()`; assert `batches` is `[[a,b],[c,d]]` in that order.
- `'flush() waits for a send that was already in flight'`: start a slow send via a full batch; call `flush()`; assert it has NOT resolved before the deferred resolves (use a flag set in `.then`); resolve; assert flush resolved.
- `'a failed send does not block later sends'`: first send rejects; second resolves; assert second delivered and `flush()` resolves.
- `'drops batches beyond maxPendingBatches and reports them'`: `maxPendingBatches: 1`, a never-resolving first send, push enough to form a second and third batch; assert the reporter was called once with a message containing `dropped`.

Rewrite `'flushes on the interval timer'` to `flushIntervalMs: 5` and await a deferred that the fake `send` resolves, rather than a fixed sleep.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` → all pass, no test sleeps longer than ~10 ms.

### Step 3: Route timer flush failures through a reporter

1. Add to `BatchTransportOptions` in `shared.ts`:

   ```ts
     /**
      * Called when a batch fails after retries, or is dropped because too
      * many batches are pending. When omitted, failures go to stderr, rate
      * limited to once every 5 seconds. Pass the same function you give
      * `config.onError` to see transport failures in one place.
      */
     onError?: (error: unknown) => void
   ```

2. In `createBatchQueue`'s input add `onError?: (error: unknown) => void`. Build a reporter once per queue that mirrors `createErrorReporter`'s behaviour but with the plain `(error) => void` shape: call `onError` inside try/catch when present; otherwise `console.error(`[logixlysia] ${name} transport failed:`, error)` at most once per 5 s. (Do not import `createErrorReporter` from `utils/report.ts` — its callback takes a `SinkErrorContext`, which the adapter layer should not know about.) Use it in `flushFromTimer` and for the pending-batches drop.

3. `createHttpTransport` passes `input.options.onError` through.

4. In `output/index.ts` `logToTransports`, no change is required for the timer path (the adapter now handles it). Leave the existing `.catch(reportTransportError)` in place for size-triggered flushes; it is the correct behaviour for user-written transports.

**Verify**: new test `'timer flush failure calls onError'` — `flushIntervalMs: 5`, `send` rejects, `onError: mock()`; push one entry; await a deferred resolved inside the rejected send's `.catch`… simplest: make `send` reject and resolve a `signal` promise in the same tick; await `signal`; then `await Promise.resolve()` twice; assert `onError` called once and `console.error` not called (spy it with `__tests__/_helpers/console.ts` `spyConsole(['error'])`).

**Verify**: new test `'timer flush failure without onError logs to stderr once'` — same setup, no `onError`, two failing flushes 5 ms apart → `console.error` spy called exactly once.

### Step 4: `Retry-After` and body release in `attemptPost`

- Add `MAX_RETRY_AFTER_MS = 30_000`. After computing `retryable`, read `response.headers.get('retry-after')`; parse as delta-seconds (`Number.parseInt`, finite, ≥ 0) or HTTP-date (`Date.parse(value) - Date.now()`); if valid, clamp to `[0, MAX_RETRY_AFTER_MS]` and use it as the sleep instead of `RETRY_BASE_DELAY_MS * (attempt + 1)`. Add jitter: multiply the linear delay by `0.5 + Math.random()` (not the `Retry-After` delay).
- On the success path, before `return`, call `await response.body?.cancel()` wrapped in try/catch (ignore errors). Do the same after reading `detail` on the failure path is unnecessary (`text()` consumes it).
- Thread the delay through `retryOrRethrow(error, delayMs?)`.

**Verify**: extend `stubFetch` in `helpers.ts` to accept optional `headers?: Record<string, string>` per queued response and to support a `{ reject: Error }` entry that makes `fetch` reject (for timeout/abort simulation). Add tests:

- `'honors Retry-After on 429'`: responses `[{ status: 429, headers: { 'retry-after': '1' } }, { status: 200 }]`; measure elapsed around `postWithRetry` with `performance.now()`; assert ≥ 900 ms and 2 fetch calls. (This one test may take ~1 s; acceptable.)
- `'clamps a huge Retry-After'`: header `'3600'` and `MAX_RETRY_AFTER_MS` behaviour is impractical to wait for — instead export a small pure helper `resolveRetryDelay(response, attempt)` from `shared.ts` and unit-test it: `'3600'` → 30000, `'abc'` → linear fallback in `[125, 375]` for attempt 0, HTTP-date 5 s ahead → ≈ 5000.
- `'wraps a non-Error rejection with cause'`: `stubFetch([{ reject: 'boom' as unknown as Error }])` with `retries: 0` → rejects with an `Error` whose `cause === 'boom'`.
- `'retries after an aborted request'`: `[{ reject: new DOMException('aborted', 'AbortError') }, { status: 200 }]` → resolves, 2 calls.

`cd packages/logixlysia && bun test __tests__/adapters` → all pass.

### Step 5: Docs paragraph, changeset, format, full gate

In `apps/docs/content/adapters/overview.mdx`, under the section that lists shared batching options (search for `flushIntervalMs`), add one sentence documenting `onError` and `maxPendingBatches`. Create the changeset. Run `bun run format`.

**Verify**: `bun run lint && bun run typecheck && cd packages/logixlysia && bun test` → all exit 0.

## Test plan

- `__tests__/adapters/shared.test.ts`: ordering under slow send; `flush()` waits for in-flight; failed send does not block; pending-batch cap drops and reports; timer flush → `onError`; timer flush → stderr once without hook; `Retry-After` honored; `resolveRetryDelay` unit cases; non-Error rejection wrapped; abort retried.
- `__tests__/adapters/helpers.ts`: `stubFetch` gains per-response `headers` and a `reject` mode.
- Pattern: existing `describe('createBatchQueue')` and `describe('postWithRetry')` blocks in the same file.

## Done criteria

- [ ] `grep -n "console.error" packages/logixlysia/src/adapters/shared.ts` shows only the rate-limited fallback inside the reporter (one site)
- [ ] `grep -n "maxPendingBatches\|onError" packages/logixlysia/src/adapters/shared.ts` shows both options on `BatchTransportOptions`
- [ ] `cd packages/logixlysia && bun test` exits 0 with ≥ 9 new tests
- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] No adapter file (`src/axiom.ts` … `src/sentry.ts`, `src/adapters/otlp-core.ts`) is modified (`git status`)
- [ ] `.changeset/adapter-batch-queue.md` exists
- [ ] `plans/README.md` status row updated

## STOP conditions

- `createBatchQueue` or `attemptPost` no longer match the excerpts (drift).
- An adapter file turns out to call `createBatchQueue` directly with extra arguments (grep `createBatchQueue` in `src/` — expected only in `shared.ts`).
- Serializing sends causes an existing adapter test to fail for a reason other than ordering (report the test name and failure).
- `bun test` cannot spy on `console.error` via `spyConsole` in this file (e.g. Bun's `console` is frozen in this version) — report rather than switching to a different assertion.

## Maintenance notes

- Plan 025 relies on `flush()` meaning "every batch queued so far has settled". If anyone later re-parallelizes sends, `flush()` must still await the full tail.
- `maxPendingBatches` × `maxBatchSize` bounds memory per adapter (default 32 × 20 = 640 entries). Document this if the defaults change.
- Reviewer focus: the `tail = send.catch(() => undefined)` line (a rejected send must not stop subsequent sends), and that `push` still returns the same promise shape as before so `logToTransports`' `.catch` keeps working.
- Deferred: exposing queue depth (`pending`) for observability — direction item "make the logger observable to itself" in `plans/README.md`.
