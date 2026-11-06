# Plan 088: `runJob` logs work outside a request through the full pipeline, and synthetic requests keep their method label

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: this plan runs after plan 086 merged, so `src/index.ts`, `src/types/config.ts` and the sampling files have moved since `1f1d591`. Confirm that each excerpt below still reads as quoted, and that `grep -n "accessLine" packages/logixlysia/src/types/config.ts` prints a match. If plan 086 is missing or an excerpt differs, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (new public method; changes the method label on WebSocket lines)
- **Depends on**: plans/086-access-line-path-filter-and-tail-keep.md
- **Category**: direction
- **Planned at**: commit `1f1d591`, 2026-11-06

## Why this matters

Cron jobs, queue consumers and scripts are half of what a backend does, and they get no real logging from this package. Issue #203 asked for exactly that. `useLogger()` is a no-op outside a request, and the FAQ sends people to `store.pino`, which bypasses transports, the file sink and value-pattern redaction. So a nightly job's failures never reach Datadog while every HTTP 404 does. A job should get what a request gets: one final line with duration, outcome and accumulated context, through every sink.

Building the job's synthetic request exposes a bug with the same cause. `new Request(url, { method: 'WS' })` is normalised to `GET` by Bun, so every `wrapWs` line says `GET` while `features/websocket.mdx:41` promises `WS`.

## Decisions already made (do not reopen)

Taken with the maintainer's co-decider; the facts marked "observed" were run on Bun 1.3.14.

1. The API is `logs.runJob(name, log => …)`, attached next to `wrapWs`. The method label on the line is `JOB`.
2. The synthetic request is a fresh, real `Request` per run with an own `method` property. A plain object also worked (observed) but needs a cast, and enrichers are typed `(request: Request)`.
3. The pathname comes from the `URL` pathname setter. `a?b#c` becomes `/a%3Fb%23c` without throwing (observed).
4. Status is 200, or a forced 500 when `fn` throws, because level and tail rules read it.
5. The final line is always written. A `log.info` inside the job does not replace it. This differs from requests on purpose.
6. `useLogger()` works inside regardless of `useAsyncLocalStorage`, through `loggerStorage.run` (observed to hold across an `await` with the flag off).
7. On throw: write the error line, then rethrow the same value. On success: return `fn`'s value.
8. There is no plugin-free form. `logixlysia(config)` builds without listening (observed), and the package root imports elysia anyway.
9. There is no `fork`. `mergeContext` covers it, and `runJob` is callable from a handler.
10. Two faults cause the label bug: `new Request` normalises the method, and `redactRequest` rebuilds through `new Request`, so a label was lost under `autoRedact` on a path that gets masked, such as `/job-a@b.co` (observed). One helper fixes both.
11. Docs must show `await flushLogixlysia(options)` at the end of a script, and must point sampled jobs at `tail.paths`. With head `INFO: 0`, a successful job wrote zero records (observed).

## Current state

- `packages/logixlysia/src/websocket/wrap-ws.ts:21-30`:

```ts
const wsRequestCache = new Map<string, Request>()

const wsSyntheticRequest = (path: string): Request => {
  let request = wsRequestCache.get(path)
  if (!request) {
    request = new Request(`http://logixlysia.local${path}`, { method: 'WS' })
    wsRequestCache.set(path, request)
  }
  return request
}
```

- `packages/logixlysia/src/utils/redact.ts`, the end of `redactRequest`:

```ts
const init: RequestInit = {
  headers: nextHeaders,
  method: redactedMethod,
  redirect: request.redirect,
  signal: request.signal
}

return new Request(redactedUrl, init)
```

- `packages/logixlysia/src/index.ts`, type: `LogixlysiaPlugin<TFields> = Logixlysia<TFields> & { wrapWs: ReturnType<typeof createWsHandlerWrapper> }`. End of the factory: `return Object.assign(plugin, { wrapWs }) as LogixlysiaPlugin<TFields>`.
- `src/index.ts`, `.onRequest`:

```ts
    .onRequest(({ request, set, store }) => {
      const record = openRecord(request)
      record.setHeaders = set.headers
      store.beforeTime = record.startedAt
      logger.beginRequest(request)
      if (requestIdConfig) {
        const requestId = getOrCreateRequestId(request, requestIdConfig)
        contextStore.mergeContext(request, { requestId })
        // Set at the start as well as at close: a short-circuited request
        // never reaches the later hooks, and the wrap runs after the Response
        // exists.
        set.headers[requestIdConfig.header] = requestId
      }

      if (enrichers) {
        applyRequestEnrichers(enrichers, contextStore, request, onSinkError)
      }

      if (useAsyncLocalStorage && !record.seenByWrap) {
        loggerStorage.enterWith(createRequestScopedLogger(request))
      }
    })
```

- `src/index.ts`: `closeRequest(request, setHeaders, status, responseHeaders?)` echoes the id, runs response enrichers, resolves tail sampling and returns the `StoreData` for the final line. `emitAccessLine(request, status, store)` writes `{ status, context }`. `logger.handleHttpError(request, error, { ...store, status })` writes the error line. `createRequestScopedLogger(request)` builds the `log` object. `reportFormatError(failure, onSinkError)` is the existing guard. `DEFAULT_STATUS` and `SERVER_ERROR_STATUS` already exist.
- `apps/docs/content/faq.mdx:160-195` is the "outside of Elysia routes" answer that recommends `store.pino`.
- `apps/docs/content/features/meta.ts` and `apps/docs/content/docs.json:45-57` are the two nav lists for feature pages. `apps/docs/content/features/transports.mdx` has `## Best Practices` as its last section.
- Test patterns: `__tests__/sampling/plugin.test.ts` for a capture transport, `__tests__/websocket/wrap-ws.test.ts` for WebSocket lines.
- Repo style: arrow functions, no comments unless the code cannot show the why, oxlint and oxfmt enforced. Never disable a lint rule or add an ignore comment. Docs snippets are typechecked unless the fence says `check=skip`.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (repo root) | exit 0 |
| Lint and format | `bun run lint`, `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 (docs snippets compile) |
| Tests | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/utils/synthetic-request.ts` (create), `src/utils/redact.ts`, `src/websocket/wrap-ws.ts`, `src/index.ts`, `__tests__/utils/synthetic-request.test.ts` (create), `__tests__/websocket/wrap-ws.test.ts`, `__tests__/plugin/run-job.test.ts` (create), `apps/docs/content/features/background-jobs.mdx` (create), `features/meta.ts`, `docs.json`, `faq.mdx`, `features/transports.mdx`, `api-reference.mdx`, `.changeset/websocket-method-label.md`, `.changeset/run-job.md` (create).

**Out of scope**: the WebSocket upgrade's status of 200, a typed per-connection WebSocket logger, `fork`, a `logixlysia/testing` subpath, `createLogger`, the API snapshot (no new module export; `runJob` is an instance method). Do not edit `features/websocket.mdx`; it is already correct once the bug is fixed.

## Git workflow

- Branch `improve/088-run-job`, from `origin/main` after plan 086 merged.
- Commits, in this order: `fix(websocket): label lifecycle lines WS, not GET`, `feat(plugin): add runJob for work outside a request`, `docs: log background jobs and capture lines in tests`.
- `git -c commit.gpgsign=false commit …`; no trailers. Run `git checkout -- AGENTS.md` before committing. Do not push.

## Steps

### Step 1: The label fix, test first

In `wrap-ws.test.ts` add: a lifecycle line's `meta.request.method` is `'WS'`; the same with `autoRedact: true` on a path that gets masked, such as `/chat-a@b.co`. In `__tests__/utils/synthetic-request.test.ts`: `syntheticRequest('JOB', 'a?b#c')` has `method === 'JOB'` and pathname `/a%3Fb%23c`; `labelRequest` returns the same object when the method already matches.

**Verify**: the WebSocket tests fail with `GET`.

Create `src/utils/synthetic-request.ts`:

```ts
const SYNTHETIC_ORIGIN = 'http://logixlysia.local'

/** `new Request` normalises a method it does not know to `GET`, so the label is set on the instance. */
export const labelRequest = (request: Request, method: string): Request =>
  request.method === method
    ? request
    : Object.defineProperty(request, 'method', { value: method })

export const syntheticRequest = (method: string, path: string): Request => {
  const url = new URL(SYNTHETIC_ORIGIN)
  url.pathname = path
  return labelRequest(new Request(url), method)
}
```

`wrap-ws.ts`: `request = syntheticRequest('WS', path)`. `redact.ts`: `return labelRequest(new Request(redactedUrl, init), redactedMethod)`.

**Verify**: `cd packages/logixlysia && bun test __tests__/websocket __tests__/utils` passes. Commit.

### Step 2: `runJob`, test first

Create `__tests__/plugin/run-job.test.ts`. Build the plugin with `disableFileLogging`, `disableInternalLogger` and a capture transport, without an Elysia app around it. Cases:

1. `await logs.runJob('nightly-sync', () => 42)` returns 42 and writes one `INFO` record with `meta.request.method === 'JOB'`, a URL ending `/nightly-sync`, `meta.status === 200`, and a numeric `durationMs`.
2. `log.mergeContext({ rows: 3 })` puts `rows` on `meta.context` of that line.
3. `log.info('step')` writes its line and the final line still writes: two records.
4. `useLogger().mergeContext({ a: 1 })` called inside `fn`, after an `await`, reaches the final line, with `useAsyncLocalStorage` left off. After `runJob` settles, `useLogger().info('x')` writes nothing.
5. A throw: the same error rejects out of `runJob`, one `ERROR` record is written with `meta.status === 500` and the message on it. A thrown `new HttpError(402, 'x')` also logs 500.
6. A sync throw inside `fn` behaves the same.
7. `sampling: { head: { INFO: 0 }, tail: { paths: ['/nightly-sync'] } }`: the record is written. With `tail: { status: 500 }` and a success, nothing is written. With that config and a throw, the error line and a buffered `log.info` are both written.
8. `logFilter: { accessLine: { include: ['/api/**'] } }` does not hide a job's line.
9. An enricher's field is on the job's line. `requestId: true` puts a `requestId` on it.
10. Two concurrent jobs keep their contexts apart.
11. `runJob('', fn)` and a non-string name reject with `TypeError` and do not call `fn`.
12. Calling `runJob` from inside an Elysia handler leaves the handler's own access line and its context unaffected.

**Verify**: the file fails because `runJob` does not exist.

Implement in `src/index.ts`:

- Extract `openRequestScope(request: Request, setHeaders)` from `.onRequest`: `logger.beginRequest(request)`, the `requestIdConfig` block, the `enrichers` block. `.onRequest` calls it and keeps its own lines for `record`, `store.beforeTime` and the ALS `enterWith`.
- Add:

```ts
const finishJob = (request: Request, status: number, error?: unknown): void => {
  try {
    const store = closeRequest(request, {}, status)
    if (status >= CLIENT_ERROR_STATUS) {
      logger.handleHttpError(request, error, { ...store, status })
    } else {
      emitAccessLine(request, status, store)
    }
  } catch (failure) {
    reportFormatError(failure, onSinkError)
  }
}

const runJob = async <T>(
  name: string,
  fn: (log: RequestScopedLogger<TFields>) => T | Promise<T>
): Promise<T> => {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError(
      "logixlysia: runJob(name, fn) expects a non-empty job name first, e.g. plugin.runJob('nightly-sync', log => {})"
    )
  }
  const request = syntheticRequest('JOB', name)
  openRecord(request)
  try {
    openRequestScope(request, {})
  } catch (failure) {
    reportFormatError(failure, onSinkError)
  }
  const log = createRequestScopedLogger(request)
  let value: T
  try {
    value = await loggerStorage.run(log, () =>
      fn(log as RequestScopedLogger<TFields>)
    )
  } catch (error) {
    finishJob(request, SERVER_ERROR_STATUS, error)
    throw error
  }
  finishJob(request, DEFAULT_STATUS)
  return value
}
```

- `CLIENT_ERROR_STATUS` already exists from plan 086.
- Add `runJob` to the `LogixlysiaPlugin` type with a generic signature and a doc comment that says what it writes and that it rethrows, and add it to the `Object.assign`.

Note that `closeRequest` may set `record.accessLineReplaced`; `finishJob` does not read that flag, which is what keeps decision 5 true.

**Verify**: `bun test __tests__/plugin/run-job.test.ts` passes, then the whole suite. Commit.

### Step 3: Docs

- Create `features/background-jobs.mdx`, title "Background Jobs", and add `'background-jobs'` after `'websocket'` in `features/meta.ts` and `"features/background-jobs"` in `docs.json`. Cover: a cron example with `mergeContext`; what the line looks like (`JOB /nightly-sync 200 …`); that the final line always writes and a thrown error is rethrown after the error line; `useLogger()` inside helpers; a script ending in `await flushLogixlysia(options)` with the same `options` object, because a batching transport has no other chance to send; sampling (a successful job is head-sampled like anything else, so a `tail.paths` rule keeps it). Keep it under 80 lines.
- `faq.mdx:160-195`: rewrite the answer to lead with `runJob`, link the new page, and keep `store.pino` as the choice for a free-standing line that needs no sinks, stating plainly that it bypasses transports, the file sink and value-pattern redaction.
- `features/transports.mdx`: add `## Testing Your Logs` before `## Best Practices`: a capture transport of about five lines that pushes to an array, passed in `transports`, then an assertion after `await app.handle(new Request(…))`.
- `api-reference.mdx`: a `runJob` section beside `wrapWs` with the signature and two sentences. If `wrapWs` has no section, add one for `runJob` under the plugin's section.
- Changesets: `websocket-method-label.md` (`patch`, "WebSocket lifecycle lines are labelled `WS` as documented, not `GET`.") and `run-job.md` (`minor`).

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0, and `cd packages/logixlysia && bun run build && bun test` passes. Commit.

## Test plan

The cases in Steps 1 and 2. Before reporting, confirm the WebSocket tests fail without Step 1's source change, and that case 8 fails if the filter is moved into `emitAccessLine`. Do not commit that experiment.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0 at the repo root
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the API snapshot unchanged
- [ ] `grep -n "new Request(\`http://logixlysia.local" packages/logixlysia/src/websocket/wrap-ws.ts` prints nothing
- [ ] `git status --short` lists only in-scope paths

## STOP conditions

- Bun crashes or segfaults on any `runJob` test. An earlier probe of `useAsyncLocalStorage` on the unwrapped path segfaulted Bun 1.3.14.
- `Object.defineProperty(request, 'method', …)` throws, or a sink still reports `GET` after it.
- An existing test asserts `GET` on a WebSocket line.
- Attaching `runJob` conflicts with an Elysia instance member, or `.use(logs)` no longer typechecks.
- A job needs a change to `emit.ts` or `handleHttpError` to write its line.

## Maintenance notes

- A sink that reads `request.method` sees the label. One that clones the request must go through `labelRequest`, as `redactRequest` does.
- Requests replace their access line on a custom log and jobs do not. If the `next` line makes "always write" the default for requests, the difference goes away, and `finishJob` may collapse into `finishRequest`.
- Deferred: a job-level `fork`, and a `WS` status of 101 on the upgrade line.
