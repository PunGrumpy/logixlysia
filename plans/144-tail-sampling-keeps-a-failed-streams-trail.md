# Plan 144: `sampling.tail.status` keeps the trail of a request that ended in an error, and `tail.keep` sees the error

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/src/logger/index.ts packages/logixlysia/src/sampling/index.ts packages/logixlysia/src/types/config.ts packages/logixlysia/__tests__/sampling/plugin.test.ts packages/logixlysia/__tests__/sampling/runtime.test.ts apps/docs/content/features/sampling.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition. A change to `src/index.ts` that
> touches only `flushLogixlysia` or the `onStop` hook is expected (another
> pull request owns them) and is not a mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`sampling.tail.status` is how a user says "keep the full log trail of failed requests": the type comment on `SamplingConfig.tail` promises "so failures and slow paths keep their full log trail". The verdict compares only the status the client got. A request can end in an error the plugin logs at `ERROR` while the client got a lower status: a streamed body that throws after its first chunk (the client already has a `200`), or an error an `onError` hook answered with a redirect. For those requests the trail is thrown away and only the `ERROR` line survives, which is the case the user configured tail sampling for. `tail.keep` cannot rescue them either, because the outcome it receives has no error in it.

Measured at `c019a4f` on Bun 1.3.14 with `sampling: { head: { INFO: 0 }, tail: { status: … } }`, a transport that prints `LEVEL:message:status`, and a handler that calls `log.info('step 1')` before it fails:

| Request                                   | `tail.status` | Lines written today                 | `tail.keep` received          |
| ----------------------------------------- | ------------- | ----------------------------------- | ----------------------------- |
| stream throws after its first chunk       | 500           | `ERROR:stream boom:200`             | `{ status: 200 }`, no error   |
| `onError` answers the error with a 302    | 500           | `ERROR:mapped boom:302`             | `{ status: 302 }`, no error   |
| stream throws after its first chunk       | 503           | `ERROR:stream boom:200`             | `{ status: 200 }`, no error   |
| handler throws `new Error`, client gets 500 | 503         | `ERROR:plain boom:500`              | `{ status: 500 }`, no error   |
| handler throws `new HttpError(404, …)`    | 500           | `WARNING:missing:404`               | `{ status: 404 }`, no error   |
| handler throws `status(202, …)`           | 500           | nothing                             | `{ status: 202 }`, no error   |

After this plan, a request that ended in an error the plugin logs at `ERROR` counts as a `500` for the `tail.status` comparison when the client got less than `500`. The first two rows therefore also write `INFO:step 1` before the `ERROR` line (the `status` rule matches, so `keep` is not called for them). The two `503` rows write what they write today: a user who sets `503` has said a `500` is below their bar, and a thrown `Error` the client got as a `500` is compared with its true status, as before. Whenever `tail.keep` runs, its outcome carries a new `error` field holding what was thrown: the `404` row now hands it the `HttpError`, and a stream that fails with only a `durationMs` rule configured hands it the stream's `Error` with `status: 200`. The last two rows also write what they write today: a thrown 4xx is logged at `WARNING` and stays under a `500` threshold, and a thrown `status()` result below 400 is a response, not an error. Nothing changes for a request with no recorded error, or when `sampling` is not configured.

## Current state

All source paths are relative to `packages/logixlysia/`.

### How a request records an error

`src/index.ts` lines 103 to 111 hold the per-request record:

```ts
interface RequestRecord {
  error?: unknown
  phase: 'open' | 'streaming' | 'closed'
  seenByWrap: boolean
  setHeaders?: Record<string, string | number>
  startedAt: bigint
  streamPulled: boolean
  streamStatus?: number
}
```

`record.error` is set in these places: the stream wrappers' `catch` when a generator body throws (lines 204 and 243) and their cleanup (lines 163 and 175), `wrapFetch` when Elysia's `fetch` rejects (line 790, then the request is finished with 500), the `onError` hook (line 893) and the `onAfterResponse` hook (line 916). The `onError` hook also sees a thrown `status()` result, so `record.error` can hold one.

### The tail verdict runs before the error line

`src/index.ts` lines 536 to 572, `closeRequest`, ends by resolving the tail verdict with the status only:

```ts
  const closeRequest = (
    request: Request,
    setHeaders: Record<string, string | number>,
    status: number,
    responseHeaders?: Headers
  ): StoreData => {
    …
    logger.finalizeRequest(request, store, status)
    return store
  }
```

`src/index.ts` lines 606 to 652, `finishRequest`, calls it and only afterwards writes the error line:

```ts
  const finishRequest = (
    request: Request,
    record: RequestRecord,
    status: number,
    responseHeaders?: Headers
  ): void => {
    if (record.phase === 'closed') {
      return
    }
    record.phase = 'closed'
    const owner = lineOwners.get(request)
    const lineWrittenByAnotherInstance =
      record.seenByWrap && owner !== undefined && owner !== instance
    if (lineWrittenByAnotherInstance) {
      try {
        logger.finalizeRequest(
          request,
          { beforeTime: record.startedAt },
          status
        )
      } catch (failure) {
        reportFormatError(failure, onSinkError)
      }
      return
    }
    try {
      const store = closeRequest(
        request,
        record.setHeaders ?? {},
        status,
        responseHeaders
      )
      if (isExcluded(request)) {
        return
      }
      if (
        record.error !== undefined &&
        (status >= 400 || !isStatusResponse(record.error))
      ) {
        logger.handleHttpError(request, record.error, { ...store, status })
      } else if (!hidesAccessLine(request, status)) {
        emitAccessLine(request, status, store)
      }
    } catch (failure) {
      reportFormatError(failure, onSinkError)
    }
  }
```

`isStatusResponse` is already imported at the top of `src/index.ts` (line 19).

`src/logger/handle-http-error.ts` lines 42 to 44 choose the level of that error line. A value that is not a `status()` result is logged at `ERROR` unless the client got a 4xx:

```ts
  const status = store.status ?? errorStatus(error)
  const level: LogLevel =
    isStatusResponse(error) || status >= 400 ? levelForStatus(status) : 'ERROR'
```

`levelForStatus` (`src/helpers/status.ts`) returns `'ERROR'` for 500 and up, `'WARNING'` for 400 to 499, `'INFO'` below 400.

### The outcome and the verdict

`src/logger/index.ts` lines 134 to 141 type the plugin's logger (internal, not exported from the package root under this name):

```ts
export interface PluginLogger extends Logger {
  /** Returns the number of buffered records the tail verdict replayed. */
  finalizeRequest: (
    request: RequestInfo,
    store: StoreData,
    status: number
  ) => number
```

`src/logger/index.ts` lines 186 to 204 build the outcome:

```ts
  const finalizeRequest = (
    request: RequestInfo,
    store: StoreData,
    status: number
  ): number => {
    if (!sampling || isExcludedRequest(sinks, request)) {
      return 0
    }

    const outcome = {
      context: config?.sampling?.tail?.keep
        ? contextStore.getContext(request)
        : NO_CONTEXT,
      durationMs: elapsedMs(store.beforeTime),
      pathname: parseRequestUrlOnce(request).pathname,
      status
    }

    const replayed = sampling.finalize(request, outcome)
```

Line 14 of the same file is `import { resolveSampling } from '../sampling'`. `src/sampling/index.ts` re-exports the type: `export type { RequestOutcome } from '../types/config'`.

`src/sampling/index.ts` lines 103 to 124, the verdict:

```ts
const matchesTail = (
  tail: ResolvedTail,
  outcome: RequestOutcome,
  onError: ((context: SinkErrorContext) => void) | undefined
): boolean => {
  if (tail.status !== undefined && outcome.status >= tail.status) {
    return true
  }
  if (tail.durationMs !== undefined && outcome.durationMs >= tail.durationMs) {
    return true
  }
  …
  return tail.keep !== undefined && matchesKeep(tail.keep, outcome, onError)
}
```

Its imports (lines 1 to 9) are an `import type { … } from '../interfaces'`, `import type { RequestOutcome } from '../types/config'`, `import { createErrorReporter } from '../utils/report'` and `import { … } from './glob'`.

`src/types/config.ts` lines 94 to 125, the public types:

```ts
/** How a request finished, matched against {@link TailSamplingConfig}. */
export interface RequestOutcome {
  /**
   * A copy of the fields merged into the request so far. Changing it does not
   * change what later lines carry.
   */
  context: Readonly<Record<string, unknown>>
  durationMs: number
  pathname: string
  status: number
}
…
  /** Rescue when the response status is at or above this code, e.g. `400`. */
  status?: number
}
```

`RequestOutcome` is exported from the package root as a type (`src/index.ts`, the `export type { RequestOutcome, … } from './sampling'` near the end). The API snapshot test (`__tests__/api/surface.test.ts`) records runtime export names only, so a new optional field does not change it.

### Paths this plan does not change, checked

- WebSocket lines (`src/websocket/wrap-ws.ts`) never call `beginRequest` or `finalizeRequest`, so they are never buffered for a tail verdict.
- `runJob` closes its synthetic request through `finishJob` (`src/index.ts` lines 729 to 746), which calls `closeRequest(request, {}, status)` with no error. A failed job is closed with status 500. It behaves exactly as it does today: measured before and after the prototype of this plan, a failing job keeps its `INFO` line under `tail.status: 500` and loses it under `tail.status: 503`.

### Conventions

- Tests use `bun:test`, drive the plugin through `app.handle(new Request(…))`, capture lines with a mock transport and assert literal values. The file to extend, `__tests__/sampling/plugin.test.ts`, builds its app with `buildApp(config, transport)` and reads lines from `events` (level, message, meta).
- `__tests__/_helpers/wait-for.ts` exports `waitFor(predicate)`, which polls every 10 ms for up to a second. A streamed body's final line is written from the stream wrapper's `finally`, so a test of a streamed request waits for the `ERROR` line with it instead of sleeping.
- Comments say why, never what. Functions are `const` arrow functions.

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose        | Command                                                                                                              | Expected on success                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Install        | `bun install --frozen-lockfile` (root)                                                                               | exit 0                                                |
| Build          | `cd packages/logixlysia && bun run build`                                                                            | `Build completed`                                     |
| Lint           | `bun run lint` (root)                                                                                                | exit 0                                                |
| Format         | `bun run format` (root)                                                                                              | exit 0; read the diff it makes                        |
| Typecheck      | `cd packages/logixlysia && bun run typecheck`                                                                        | exit 0                                                |
| Two test files | `cd packages/logixlysia && bun test ./__tests__/sampling/plugin.test.ts ./__tests__/sampling/runtime.test.ts`        | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite     | `cd packages/logixlysia && bun test`                                                                                 | 0 fail (1249 tests at `c019a4f`, 1264 after this plan) |
| Docs typecheck | `cd apps/docs && bun run typecheck`                                                                                  | exit 0                                                |

The full suite has child-process tests with a 5 second default timeout that can time out on a loaded machine. If only tests that spawn a process fail with a time near 5000 ms, rerun the suite once; that is not caused by this plan.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/index.ts` (only `closeRequest` and `finishRequest`)
- `packages/logixlysia/src/logger/index.ts` (only `PluginLogger.finalizeRequest`, `finalizeRequest` and one type import)
- `packages/logixlysia/src/sampling/index.ts` (only `matchesTail`, and two constants and one helper above it)
- `packages/logixlysia/src/types/config.ts` (only `RequestOutcome` and the doc comment of `TailSamplingConfig.status`)
- `packages/logixlysia/__tests__/sampling/plugin.test.ts`
- `packages/logixlysia/__tests__/sampling/runtime.test.ts`
- `apps/docs/content/features/sampling.mdx` (the "Tail Sampling" and "Custom rules" sections only)
- `.changeset/tail-sampling-keeps-failed-requests.md` (create)

**Out of scope** (do NOT touch):

- `flushLogixlysia` and the `onStop` hook in `src/index.ts`. Another pull request owns them. This plan does not need them.
- `finishJob` and `runJob` in `src/index.ts`. A failed job keeps today's behaviour (see Maintenance notes).
- `src/websocket/**`. WebSocket lines never reach a tail verdict.
- `src/logger/handle-http-error.ts` and the level of any line. Which lines are written, and at what level, does not change; only which buffered lines are replayed before them.
- The `Logger` type in `src/types/logger.ts`. It is public; the new parameter goes on the internal `PluginLogger` only.
- `src/utils/report.ts`, `src/output/**`, `src/adapters/**`, `__tests__/adapters/shared.test.ts`, and the docs pages `configuration.mdx`, `features/filtering.mdx`, `features/background-jobs.mdx` and every page other than `features/sampling.mdx`. Other pull requests are editing them. `configuration.mdx` names `RequestOutcome` without listing its fields, so it needs no change.
- Any new option, export or dependency. `error` is a new field on an existing exported type and nothing more.

## Git workflow

- Branch: `fix/tail-sampling-keeps-failed-requests`, cut from the base commit your task names.
- Three commits, in this order:
  1. `fix(sampling): keep a failed request's trail under tail.status and hand tail.keep the error` (the four source files and both test files; it turns the six tests from Step 1 green)
  2. `docs(sampling): say tail.status keeps failed streams and keep receives the error`
  3. `chore(changeset): note that tail sampling keeps the trail of failed requests`

  The `error` field and the `tail.status` rule are one change: the rule reads the field, so they share a commit.
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing tests

**`__tests__/sampling/plugin.test.ts`.** Add the import as the last import line of the file:

```ts
import { waitFor } from '../_helpers/wait-for'
```

In `buildApp`, after the `/debug-404` route, add four routes:

```ts
    .get('/stream-fails', function* streamFails({ log }) {
      log.info('sent the first chunk')
      yield 'a'
      throw new Error('stream failed')
    })
    .get('/stream-ok', function* streamOk({ log }) {
      log.info('sent the first chunk')
      yield 'a'
    })
    .get('/accepted', ({ log, status }) => {
      log.info('queued the work')
      throw status(202, 'queued')
    })
    .get('/missing', ({ log }) => {
      log.info('looked up the order')
      throw new HttpError(404, 'no order')
    })
```

After the existing `get` helper, add:

```ts
const readStream = async (
  app: ReturnType<typeof buildApp>,
  path: string,
  events: CapturedEvent[]
): Promise<void> => {
  const response = await get(app, path)
  await response.text().catch(() => '')
  await waitFor(() => events.some(event => event.level === 'ERROR'))
}
```

Directly before `describe('tail keep predicate through the plugin', …)`, add this block:

```ts
describe('tail status and a request that ends in a logged error', () => {
  test('keeps the trail of a stream that fails after its first chunk', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 500 } } },
      transport
    )

    await readStream(app, '/stream-fails', events)

    expect(
      events.map(event => [event.level, event.message, event.meta.status])
    ).toEqual([
      ['INFO', 'sent the first chunk', undefined],
      ['ERROR', 'stream failed', 200]
    ])
  })

  test('keeps the trail of an error that onError answered with a redirect', async () => {
    const { events, transport } = createCaptureTransport()
    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            sampling: { head: { INFO: 0 }, tail: { status: 500 } },
            transports: [{ log: transport }]
          }
        })
      )
      .onError(({ set }) => {
        set.status = 302
        set.headers.location = '/login'
        return 'moved'
      })
      .get('/account', ({ log }) => {
        log.info('read the session')
        throw new Error('session expired')
      })

    const response = await app.handle(new Request('http://localhost/account'))

    expect(response.status).toBe(302)
    expect(
      events.map(event => [event.level, event.message, event.meta.status])
    ).toEqual([
      ['INFO', 'read the session', undefined],
      ['ERROR', 'session expired', 302]
    ])
  })

  test('a failed stream counts as a 500 against the threshold', async () => {
    const above = createCaptureTransport()
    const keptUnder400 = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 400 } } },
      above.transport
    )
    const below = createCaptureTransport()
    const droppedUnder503 = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 503 } } },
      below.transport
    )

    await readStream(keptUnder400, '/stream-fails', above.events)
    await readStream(droppedUnder503, '/stream-fails', below.events)

    expect(above.events.map(event => [event.level, event.message])).toEqual([
      ['INFO', 'sent the first chunk'],
      ['ERROR', 'stream failed']
    ])
    expect(below.events.map(event => [event.level, event.message])).toEqual([
      ['ERROR', 'stream failed']
    ])
  })

  test('a 5xx error below the threshold is not kept', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 504 } } },
      transport
    )

    await get(app, '/boom-logged')

    expect(events.map(event => [event.level, event.message])).toEqual([
      ['ERROR', 'downstream']
    ])
  })

  test('a stream that completes is not kept', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 500 } } },
      transport
    )

    const response = await get(app, '/stream-ok')

    expect(await response.text()).toBe('a')
    expect(events).toHaveLength(0)
  })

  test('a thrown status() result below 400 is not a failure', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 500 } } },
      transport
    )

    const response = await get(app, '/accepted')

    expect(response.status).toBe(202)
    expect(events).toHaveLength(0)
  })

  test('a thrown 4xx below the threshold is not kept', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { status: 500 } } },
      transport
    )

    await get(app, '/missing')

    expect(events.map(event => [event.level, event.message])).toEqual([
      ['WARNING', 'no order']
    ])
  })

  test('a logged error keeps nothing when tail.status is not set', async () => {
    const { events, transport } = createCaptureTransport()
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { durationMs: 60_000 } } },
      transport
    )

    await readStream(app, '/stream-fails', events)

    expect(events.map(event => [event.level, event.message])).toEqual([
      ['ERROR', 'stream failed']
    ])
  })
})
```

Inside `describe('tail keep predicate through the plugin', …)`, directly before the test `a predicate that mutates its context does not change later lines`, add:

```ts
  test('hands the predicate what a stream threw after its first chunk', async () => {
    const { events, transport } = createCaptureTransport()
    const keep = mock((_outcome: RequestOutcome) => false)
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { keep } } },
      transport
    )

    await readStream(app, '/stream-fails', events)

    const [received] = keep.mock.calls[0] ?? []
    expect(received?.status).toBe(200)
    expect(received?.error).toBeInstanceOf(Error)
    expect((received?.error as Error | undefined)?.message).toBe(
      'stream failed'
    )
  })

  test('hands the predicate what a handler threw', async () => {
    const { transport } = createCaptureTransport()
    const keep = mock((_outcome: RequestOutcome) => false)
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { keep } } },
      transport
    )

    await get(app, '/missing')

    const [received] = keep.mock.calls[0] ?? []
    expect(received?.status).toBe(404)
    expect(received?.error).toBeInstanceOf(HttpError)
  })

  test('leaves error out when nothing was thrown or a status() below 400 was', async () => {
    const { transport } = createCaptureTransport()
    const keep = mock((_outcome: RequestOutcome) => false)
    const app = buildApp(
      { sampling: { head: { INFO: 0 }, tail: { keep } } },
      transport
    )

    await get(app, '/plan/free')
    await get(app, '/accepted')

    expect(keep.mock.calls.map(([outcome]) => 'error' in outcome)).toEqual([
      false,
      false
    ])
  })
```

**`__tests__/sampling/runtime.test.ts`.** Inside `describe('tail sampling', …)`, directly before the test `discards buffered records when nothing matches`, add four tests. `config` and `outcome` are the ones already defined in that file (`config.tail.status` is 400):

```ts
  test('replays a request that ended in an error below the status threshold', () => {
    const sampling = resolveSampling(config, () => 0.99)
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    const failedStream = outcome({
      error: new Error('stream failed'),
      status: 200
    })
    expect(sampling?.finalize(key, failedStream)).toHaveLength(1)
  })

  test('an error the client got below 400 counts as a 500, not more', () => {
    const sampling = resolveSampling(
      { head: { INFO: 0 }, tail: { status: 503 } },
      () => 0.99
    )
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    const failedStream = outcome({
      error: new Error('stream failed'),
      status: 200
    })
    expect(sampling?.finalize(key, failedStream)).toHaveLength(0)
  })

  test('an error with a 4xx below the status threshold is not replayed', () => {
    const sampling = resolveSampling(
      { head: { INFO: 0 }, tail: { status: 500 } },
      () => 0.99
    )
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    const notFound = outcome({ error: new Error('no order'), status: 404 })
    expect(sampling?.finalize(key, notFound)).toHaveLength(0)
  })

  test('an error rescues nothing without a status rule', () => {
    const sampling = resolveSampling(
      { head: { INFO: 0 }, tail: { durationMs: 1000 } },
      () => 0.99
    )
    const key = {}
    sampling?.begin(key)
    sampling?.buffer(key, { data: {}, durationMs: 1, level: 'INFO' })

    const failedStream = outcome({
      error: new Error('stream failed'),
      status: 200
    })
    expect(sampling?.finalize(key, failedStream)).toHaveLength(0)
  })
```

Bun runs these files without a typecheck, so they run before `error` exists on the type. `bun run typecheck` fails on them until Step 2; that is expected.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/sampling/plugin.test.ts ./__tests__/sampling/runtime.test.ts` reports 51 pass and 6 fail. The six failures are exactly:

- `tail status and a request that ends in a logged error > keeps the trail of a stream that fails after its first chunk` (the diff shows the expected `["INFO", "sent the first chunk", undefined]` row missing)
- `… > keeps the trail of an error that onError answered with a redirect`
- `… > a failed stream counts as a 500 against the threshold` (the `tail.status: 400` half: the `INFO` row is missing)
- `tail keep predicate through the plugin > hands the predicate what a stream threw after its first chunk` (`Expected constructor: [class Error]`, `Received value: undefined`)
- `tail keep predicate through the plugin > hands the predicate what a handler threw` (`Received value: undefined`)
- `tail sampling > replays a request that ended in an error below the status threshold` (`Expected length: 1`, `Received length: 0`)

Keep this output for your report.

### Step 2: Add `error` to the outcome and pass it through

In `src/types/config.ts`, add the field to `RequestOutcome` and say what `status` is:

```ts
export interface RequestOutcome {
  /**
   * A copy of the fields merged into the request so far. Changing it does not
   * change what later lines carry.
   */
  context: Readonly<Record<string, unknown>>
  durationMs: number
  /**
   * What the handler threw, or what a streamed body failed with after its
   * first chunk. Absent when nothing was thrown, and for a thrown `status()`
   * result, which is a response.
   */
  error?: unknown
  pathname: string
  /** The status the client got, `200` for a stream that failed mid-way. */
  status: number
}
```

In `src/logger/index.ts`:

- Below `import { resolveSampling } from '../sampling'`, add `import type { RequestOutcome } from '../sampling'`.
- In `PluginLogger`, add a fourth parameter `error?: unknown` to `finalizeRequest`.
- In the `finalizeRequest` implementation, add the same parameter, type the outcome, and set `error` only when there is one, so the outcome of a request with no error has no `error` key:

```ts
  const finalizeRequest = (
    request: RequestInfo,
    store: StoreData,
    status: number,
    error?: unknown
  ): number => {
    if (!sampling || isExcludedRequest(sinks, request)) {
      return 0
    }

    const outcome: RequestOutcome = {
      context: config?.sampling?.tail?.keep
        ? contextStore.getContext(request)
        : NO_CONTEXT,
      durationMs: elapsedMs(store.beforeTime),
      pathname: parseRequestUrlOnce(request).pathname,
      status
    }
    if (error !== undefined) {
      outcome.error = error
    }
```

In `src/index.ts`:

- `closeRequest` takes a fifth parameter `error?: unknown` after `responseHeaders`, and its last call becomes `logger.finalizeRequest(request, store, status, error)`.
- In `finishRequest`, directly after `record.phase = 'closed'`, add:

  ```ts
      // A thrown status() result is a response, not an error.
      const error = isStatusResponse(record.error) ? undefined : record.error
  ```

  Pass `error` as the fourth argument of the `logger.finalizeRequest(…)` call in the `lineWrittenByAnotherInstance` branch, and as the fifth argument of `closeRequest(…)`. Leave the `record.error` condition that chooses between `handleHttpError` and `emitAccessLine` exactly as it is.
- Do not change `finishJob`; its `closeRequest(request, {}, status)` call stays as it is.

**Verify**: `cd packages/logixlysia && bun run typecheck` exits 0. `bun test ./__tests__/sampling/plugin.test.ts ./__tests__/sampling/runtime.test.ts` reports 53 pass and 4 fail. The two `hands the predicate …` tests now pass. The four still failing are the two `keeps the trail …` tests, `a failed stream counts as a 500 against the threshold` and `replays a request that ended in an error below the status threshold`.

### Step 3: Count a request that ended in a logged error under `tail.status`

In `src/sampling/index.ts`, directly above `matchesTail`, add:

```ts
const CLIENT_ERROR_STATUS = 400
const SERVER_ERROR_STATUS = 500

// A thrown error the client got below 400 for (a stream that failed after its
// first chunk, an error answered with a redirect) is still logged at ERROR, so
// the status rule weighs it as the 500 it is logged as.
const statusForVerdict = (outcome: RequestOutcome): number =>
  outcome.error !== undefined && outcome.status < CLIENT_ERROR_STATUS
    ? SERVER_ERROR_STATUS
    : outcome.status
```

and change the first rule of `matchesTail` to:

```ts
  if (tail.status !== undefined && statusForVerdict(outcome) >= tail.status) {
    return true
  }
```

The verdict compares `tail.status` with the higher of the client's status and `500` for a request that ended in an error logged at `ERROR`, and with the client's status otherwise. `handleHttpError` logs a value that is not a `status()` result at `ERROR` when the status is below 400 or at least 500 (see "Current state"), and from 500 up the client's status is already the higher one, so the helper only has to replace a status below 400. A thrown 4xx keeps its own status. `outcome.status`, which `keep` reads, is not changed. Do not change the other rules, `matchesKeep`, or the order in which the rules run.

In `src/types/config.ts`, replace the one-line doc comment of `TailSamplingConfig.status` with:

```ts
  /**
   * Rescue when the response status is at or above this code, e.g. `400`.
   * A request that ended in an error the plugin logs at `ERROR` counts as a
   * `500` here when the client got less, such as a stream that failed after
   * a `200` went out.
   */
  status?: number
```

**Verify**: `cd packages/logixlysia && bun test ./__tests__/sampling/plugin.test.ts ./__tests__/sampling/runtime.test.ts` reports 57 pass and 0 fail. Run it three times; each run reports 0 fail.

### Step 4: Say it on the sampling page

In `apps/docs/content/features/sampling.mdx`:

1. After the paragraph that starts `Rules are OR-ed` (line 47), add one plain sentence: a request that ends in an error logged at `ERROR` counts as a `500` for `tail.status`. You may name the two cases this changes in the same sentence or the next one (a streamed body that failed after its first chunk went out with `200`, an error an `onError` hook answered with a redirect). Do not claim more than the Step 1 tests show: a `503` threshold does not keep them, a thrown `4xx` keeps its own status, and a thrown `status()` result below `400` is a response, not an error.
2. In the "Custom rules" section, replace the sentence on line 51 (`` `keep` rescues on anything the handler learned. It receives … ``) so that it lists the fields as: `durationMs`, `pathname`, `status` (the status the client got), a copy of the `context` merged into the request so far, and `error`, what the handler threw or what a streamed body failed with. Add that `error` is absent when nothing was thrown and for a thrown `status()` result.

Write in the page's voice. State only what the Step 1 tests show. Do not add or change a code sample.

**Verify**: `bun run format` (root) then `bun run lint` exits 0; read the diff `format` made. `cd apps/docs && bun run typecheck` exits 0.

### Step 5: Changeset, gates, commits

Create `.changeset/tail-sampling-keeps-failed-requests.md`:

```md
---
'logixlysia': minor
---

<one short paragraph for a user of the package>
```

`minor`, because `RequestOutcome` gains a public field. The paragraph says: with `sampling.tail.status` set, a request that ended in an error logged at `ERROR` now counts as a `500` for that comparison when the client got a lower status, so a streamed body that failed after its first chunk, or an error answered with a redirect, keeps its sampled-away lines under a threshold of `500` or less. `tail.keep` receives a new `error` field with what was thrown. A request whose client got `500` or more, a thrown `4xx`, and a thrown `status()` result below `400` behave as before. Write it in your own plain words.

**Verify**: `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail. Make the three commits from "Git workflow", staging files by name. `git status --porcelain` is empty afterwards.

## Test plan

- `__tests__/sampling/plugin.test.ts`: four new routes in `buildApp`, a `readStream` helper, a new `describe` with eight tests, and three new tests in the `tail keep predicate` block. Five of the eleven fail before the change: the two `keeps the trail …` tests, `a failed stream counts as a 500 against the threshold`, and the two `hands the predicate …` tests.
- `__tests__/sampling/runtime.test.ts`: four new tests in `tail sampling`. One fails before the change.
- The guards that pass before and after: a completed stream is not kept, a thrown `status(202)` is not kept and gives `keep` no `error`, a thrown 404 under a 500 threshold is not kept, a thrown 503 under a 504 threshold is not kept, a failed stream under a 503 threshold is not kept (runtime test), and an error rescues nothing without a `status` rule. They pin that nothing changes for a request without an error and that a thrown `status()` result is not one, so keep them even though they pass in Step 1.
- Pattern: the existing tests in the same two files.

## Done criteria

ALL must hold:

- [ ] `cd packages/logixlysia && bun test ./__tests__/sampling/plugin.test.ts ./__tests__/sampling/runtime.test.ts` reports 57 pass, 0 fail
- [ ] Your report quotes the Step 1 run, made before any source change, with its 6 failures
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the eight in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/index.ts` touches only `closeRequest` and `finishRequest`, and not `finishJob`, `flushLogixlysia` or `onStop`
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/types/logger.ts packages/logixlysia/src/logger/handle-http-error.ts` is empty
- [ ] The API snapshot is unchanged: `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code (apart from `flushLogixlysia` and `onStop`).
- A Step 1 test this plan says passes before the change fails, or one it says fails passes.
- After Step 3 a test still fails and the fix seems to need a change to `handleHttpError`, to the level of a line, or to a file out of scope.
- An existing test in the full suite fails with an assertion (not a 5 second child-process timeout). In particular a test that expects a request with an error to lose its buffered lines: report it with the test name instead of changing it.
- The API snapshot test fails. Nothing in this plan adds a runtime export.
- CI's Elysia 2 job fails on one of the new tests. The tests were run on Elysia 1.4.30 only; report the failing test and its output.

## Maintenance notes

- `statusForVerdict` depends on the level rule of `handleHttpError` (`src/logger/handle-http-error.ts` lines 42 to 44): a thrown value that is not a `status()` result is logged at `ERROR` below 400 and from 500 up. If that rule changes, change this one with it, or the trail kept and the level written disagree.
- `error` holds the thrown value itself, not a copy. A predicate that changes it changes what the `ERROR` line carries. Copying an arbitrary thrown value is not possible in general; the doc comment says what the field is and the docs page does not promise a copy.
- A reviewer should check that `error` is set from `record.error` only when it is not a `status()` result, and that the outcome of a request with no error has no `error` key (the `'error' in outcome` test pins this).
- Behaviour users may notice: with `tail.status` of `500` or lower, a stream that fails after its first chunk and an error answered with a redirect now keep their trail. With a threshold above `500` (say `503`) nothing changes: such a request counts as a `500`, and a thrown `Error` the client got as a `500` is compared with that true status, as before.
- Left out:
  - `runJob`: `finishJob` (`src/index.ts` line 737) does not pass the job's error to `closeRequest`, so `tail.keep` gets no `error` for a failed job. A failed job is closed with status 500, so under the rule of this plan its `tail.status` verdict is already the same as it would be with the error passed. Passing `error` there is a one-line follow-up for `keep`.
  - `apps/docs/content/features/background-jobs.mdx` line 78 says "A job that throws is kept by the `ERROR` line, along with the lines it buffered". With a tail rule that does not match the job (measured with `tail: { paths: ['/other'] }`), the buffered lines are lost and only the `ERROR` line is written. The page belongs to another pull request.
  - The `onError` path for an error thrown after the final line was written (`src/index.ts`, the `record.phase === 'closed'` branch of `onError`) writes a second error line after the tail verdict ran; nothing can be replayed for it.
