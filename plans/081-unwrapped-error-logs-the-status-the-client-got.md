# Plan 081: On the unwrapped path, an error logs the status the client received, not the error's own status

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/__tests__/plugin/hook-path-status.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

With `aot: true` the plugin's `wrap` sees the final `Response` and logs the status the client got. On the unwrapped path (`aot: false`, or a second instance that the first instance's wrap does not cover) the plugin's `onError` closes the record immediately with the thrown error's own status. A later user `onError` that maps the error (for example to 418 with a body) never influences the line. Reproduced: `new Elysia({ aot: false }).use(logixlysia(...)).onError(({ error, set }) => { if (error.message === 'mapme') { set.status = 418; return 'teapot' } }).get('/x', () => { throw new Error('mapme') })` → client 418, log `ERROR 500`. With `aot: true` the same app logs `WARNING 418`. The same mismatch applies to tail sampling on status. The fix is to record the error in `onError` and finish the record in `onAfterResponse`, which already runs for errors answered by an app-wide `onError` and sees `set.status`.

## Current state

`packages/logixlysia/src/index.ts`:

- The record (lines 87-97) has `error?: unknown`, `phase: 'open' | 'streaming' | 'closed'`, `seenByWrap`, `startedAt`.
- `finishUnwrapped` (lines 599-610) sets the line owner, calls `finishRequest(...)`, then `exitRequestScope()`.
- The hooks (lines 707-751):

```ts
    .onAfterHandle(({ request, set, response }) => {
      const record = openRecord(request)
      if (!record.seenByWrap) {
        finishUnwrapped(
          request,
          record,
          resolveHandledStatus(set.status, response),
          response instanceof Response ? response.headers : undefined
        )
        return
      }
      …
    })
    .onError(({ request, error }) => {
      const record = openRecord(request)
      record.error = error
      if (record.seenByWrap) {
        return
      }
      if (record.phase === 'closed') {
        // Thrown after the line was written (a route afterHandle, a response
        // schema): a second, error line.
        logger.handleHttpError(request, error, { beforeTime: record.startedAt })
        exitRequestScope()
        return
      }
      finishUnwrapped(request, record, errorStatus(error))
    })
    .onAfterResponse(context => {
      const { request, set } = context
      const record = openRecord(request)
      if (record.seenByWrap) {
        return
      }
      // An exit that reached neither hook above (a resolve short-circuit, or an
      // error an earlier app-wide onError answered).
      const error = 'error' in context ? context.error : undefined
      if (error !== undefined) {
        record.error = error
      }
      finishUnwrapped(request, record, getStatusCode(set.status))
    })
```

- `errorStatus` is in `src/logger/handle-http-error.ts:18-23` (a `status()` result's code, else `error.status`, else 500). `getStatusCode` is in `src/helpers/status.ts:60-75`.
- `finishRequest` (lines 499-560) decides between an access line and an error line from `record.error`; read it before changing the hooks.
- Test harness: `__tests__/plugin/hook-path-status.test.ts` builds the same app with `aot: true` and `aot: false` (`buildApp(aot, options)`), captures the transport call and asserts level and status per path. Model the new tests on it. `__tests__/plugin/status-resolution.test.ts` and `__tests__/logger/handle-http-error.test.ts` cover related behaviour; run them after each change.

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` | exit 0 |
| Focused tests | `cd packages/logixlysia && bun test __tests__/plugin __tests__/logger` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/index.ts` (only the `onError` and `onAfterResponse` hooks and, if needed, `finishUnwrapped`)
- `packages/logixlysia/__tests__/plugin/hook-path-status.test.ts`
- `.changeset/unwrapped-error-status.md` (create)

**Out of scope**: the `wrap` path, `finishRequest`'s line-selection logic, `src/logger/handle-http-error.ts`, the type-export list at the bottom of `src/index.ts`, every other file.

## Git workflow

- Branch `improve/081-unwrapped-error-status` from `e27dd76`.
- Commit: `fix(plugin): log the status the client got when an unwrapped error is mapped by onError`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing tests

In `hook-path-status.test.ts` add a `describe('mapped errors', …)` with cases run for both `aot: true` and `aot: false`:

1. A route that throws `new Error('mapme')` and an app-level `.onError(({ error, set }) => { if (error.message === 'mapme') { set.status = 418; return 'teapot' } })` registered **after** `.use(logixlysia(...))`. Expect the client to get 418 and the single logged record to carry `status: 418` with level `WARNING`.
2. The same app where the user `onError` returns nothing (unmapped): expect `status: 500`, level `ERROR`, as today.
3. A thrown `HttpError(404, 'nope')` (import from `../../src`) with no user `onError`: expect `status: 404`, level `WARNING`.

**Verify**: case 1 fails for `aot: false` (logs 500), the others pass.

### Step 2: Defer the finish to `onAfterResponse`

In the unwrapped branch of `onError`, when `record.phase !== 'closed'`, only record the error (`record.error = error` is already set) and return; do not call `finishUnwrapped`. `onAfterResponse` already finishes with `getStatusCode(set.status)` and copies `context.error` into the record. Confirm with the tests that `set.status` in `onAfterResponse` holds the mapped 418 and, for an unmapped error, the status Elysia chose (500, or `error.status` for an `HttpError`). If `set.status` is still the default 200 for an unmapped error in `onAfterResponse`, fall back to `errorStatus(record.error)` there: `record.error !== undefined && set.status is the default ? errorStatus(record.error) : getStatusCode(set.status)`. Prefer the smaller change that makes all three cases pass on both paths.

Keep the `phase === 'closed'` branch (a second error line after the line was written) unchanged.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin __tests__/logger` → all pass, including the existing `/broken` and validation-error cases.

### Step 3: Full suite, changeset

`.changeset/unwrapped-error-status.md`:

```md
---
'logixlysia': patch
---

With `aot: false`, an error that a later `onError` hook maps to another status (for example 418 with a body) now logs that status and level, the same as the `aot: true` path. Before, the line carried the thrown error's own status, usually 500.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Step 1's three cases × two `aot` modes in `hook-path-status.test.ts`.
- Existing suites `plugin/`, `logger/`, `integration/` unchanged and green.

## Done criteria

- [ ] Lint, typecheck exit 0; full suite passes with 6 new test cases
- [ ] The unwrapped `onError` branch no longer calls `finishUnwrapped` for an open record
- [ ] Changeset present; no files outside scope

## STOP conditions

- The hook excerpt does not match the live file.
- `onAfterResponse` does not run for an error on the `aot: false` path in some case the existing tests cover (a test in `plugin/` or `integration/` starts failing because a line is never written). Report which test; do not add a fallback timer.
- The duration or context on the error line changes in a way an existing test rejects.

## Maintenance notes

- Reviewer: check both `aot` modes produce one line per request in every case, that the `requestId` header is still set on the mapped response, and that `exitRequestScope()` still runs exactly once.
- Deferred (index): the `useAsyncLocalStorage` scope leak on nested `app.handle()` without the wrap.
