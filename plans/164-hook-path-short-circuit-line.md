# Plan 164: With `aot: false`, a request a hook answered is logged with the status the client got and no invented error

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. Do not edit `plans/README.md`; the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6a516de2..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/__tests__/plugin/hook-path-status.test.ts` If either file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `6a516de2`, 2026-11-28

## Why this matters

With `new Elysia({ aot: false })` the plugin's hooks write the access line. When a hook answers the request before the handler runs (a `resolve` or `derive` that returns `status(401, …)`, an `onRequest` that returns a `Response`), the line is written from the plugin's `onAfterResponse` hook. That hook reads `context.error`. On Elysia 1.4 `context.error` is always present: it is Elysia's `status` helper function unless a real error replaced it. The plugin stores that function as the request's error, so the line's message is the helper's source text, and a request answered `202` by `onRequest` is logged as `ERROR` with status `200`.

Measured at `6a516de2` on Elysia 1.4.30, Bun 1.3.14 (transport receives `level, message, meta.status`):

| App (`aot: false`) | Client got | Logged today | `aot: true` logs |
| --- | --- | --- | --- |
| `.resolve(() => status(401, 'no'))` | 401 | `WARNING`, message `(code, response) => new ElysiaCustomStatusResponse(code, response)`, status 401 | `WARNING`, message `''`, 401 |
| `.derive(() => status(403, 'no'))` | 403 | `WARNING`, same function text, 403 | `WARNING`, `''`, 403 |
| `.onRequest(() => new Response('early', { status: 202 }))` | 202 | `ERROR`, same function text, status **200** | `INFO`, `''`, 202 |

After this plan the `aot: false` column equals the `aot: true` column.

## Current state

- `packages/logixlysia/src/index.ts` — the plugin. The hook is at lines 986–999:

```ts
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

- In the same file, lines 66–90, `resolveHandledStatus(setStatus, response)` already computes "the status the client actually sees": a `status()` result's code, else a returned `Response`'s status unless it is 200, else `set.status` (200 when undefined or null). `onAfterHandle` (lines 951–962) calls it with `responseValue ?? response`, because Elysia 2 fills only `responseValue` and 1.x with `aot: false` fills only `response`.
- What Elysia 1.4.30 passes to `onAfterResponse` with `aot: false` (measured):
  - resolve short-circuit: `typeof context.error === 'function'`, `context.error === context.status`, `set.status` 401, `context.response` is a `Response` with status 401.
  - `onRequest` returned a `Response(…, { status: 202 })`: `context.error` is the same function, `set.status` 200, `context.response` is a `Response` with status 202.
  - handler threw, an app `onError` returned `Response(…, { status: 418 })`: `context.error` is the thrown `Error`, `set.status` 200, `context.response` is a `Response` 418.
  - handler threw, no `onError`: `context.error` is the `Error`, `set.status` 500, `context.response` undefined.
- `packages/logixlysia/__tests__/plugin/hook-path-status.test.ts` — the tests for this path. It builds apps for `aot` in `[true, false]`, captures transport calls with `createCaptureTransport()`, reads them with `recordAt(transport, index)` (returns `{ level, meta }`; `meta.status` is the logged status) and drives a request with `run(app, path)`. Match that style. The transport's second argument is the message: `transport.mock.calls[0][1]`.
- Conventions: `bun:test`; no `.only`/`.skip`; arrow functions; no new comments unless a line would otherwise be surprising; oxlint + oxfmt enforce style (`bun run lint`).

## Commands you will need

| Purpose | Command (from the repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Build (the API snapshot test needs `dist/`) | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/plugin/hook-path-status.test.ts` | all pass |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1556 pass before this plan) |
| Lint | `bun run lint` | exit 0 |
| Format | `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |

`turbo` may append a block to the root `AGENTS.md` when it runs. Never commit that: run `git checkout -- AGENTS.md` before each commit.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/index.ts` (the `onAfterResponse` hook only)
- `packages/logixlysia/__tests__/plugin/hook-path-status.test.ts`
- `.changeset/hook-path-short-circuit-line.md` (create)

**Out of scope**:

- Streaming on the hook path. With `aot: false` a generator handler's line is written when the handler returns; `apps/docs/content/features/formatting.mdx` documents that. Do not change it.
- `onError`, `onAfterHandle`, `finishRequest`, `finishUnwrapped`, `resolveHandledStatus`, `getStatusCode`.
- Docs pages: the docs already say the line carries the status the client received.

## Git workflow

- Work on the branch you were started on (`fix/hook-path-short-circuit-line`). Do not push, do not open a pull request.
- Two atomic commits with conventional messages: (1) the fix together with its tests, `fix(plugin): log the status a hook answered with when aot is off`, then (2) `chore(changeset): add hook-path-short-circuit-line`.
- Commit with `git -c commit.gpgsign=false commit`. The commit message has a subject and a short body that says why. No `Co-Authored-By`, no "Generated with", no mention of any AI tool or model anywhere.

## Steps

### Step 1: Write the failing tests

In `__tests__/plugin/hook-path-status.test.ts` add a `describe('requests a hook answered', …)` block that loops `for (const aot of [true, false])` over three apps, each built as `new Elysia({ aot }).use(logixlysia(options))…get('/x', () => 'handler')`:

1. `.resolve(() => status(401, 'no'))` → expect response status 401, exactly one transport call, `meta.status` 401, level `'WARNING'`, message `''`.
2. `.derive(() => status(403, 'no'))` → 403, one call, `meta.status` 403, `'WARNING'`, message `''`.
3. `.onRequest(() => new Response('early', { status: 202 }))` → 202, one call, `meta.status` 202, `'INFO'`, message `''`.

Also assert for each that `meta.error` is `undefined` (extend the local `CapturedMeta` interface with `error?: unknown`).

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/hook-path-status.test.ts` → the three `aot: false` cases FAIL, the three `aot: true` cases pass. If an `aot: true` case fails, STOP.

### Step 2: Fix the hook

In `onAfterResponse`:

- Take `response` and `responseValue` from the context the same way `onAfterHandle` does, and compute `const answered = responseValue ?? response`. If TypeScript says a property does not exist on the after-response context type, read it defensively (`'response' in context ? context.response : undefined`), as the existing code does for `error`. Do not use `any`.
- Record `context.error` only when it is not a function: `if (error !== undefined && typeof error !== 'function')`. Update the comment above it in one sentence: Elysia 1.x leaves its `status` helper on `context.error` when nothing was thrown.
- Replace `getStatusCode(set.status)` with `resolveHandledStatus(set.status, answered)`, and pass `answered instanceof Response ? answered.headers : undefined` as the fourth argument of `finishUnwrapped`, as `onAfterHandle` does.
- If `getStatusCode` is now unused in `index.ts`, remove it from the import.

**Verify**: `bun test __tests__/plugin/hook-path-status.test.ts` → all pass.

### Step 3: Full verification

**Verify**: `bun run build` then `bun test` in `packages/logixlysia` → 0 fail; `bun run lint` → exit 0 (run `bun run format` first if it complains about formatting); `bun run typecheck` → exit 0.

### Step 4: Changeset

Create `.changeset/hook-path-short-circuit-line.md`:

```md
---
'logixlysia': patch
---

With `aot: false`, a request that a `resolve`, `derive` or `onRequest` hook answered is logged with the status the client received and without an error. Before, the line's message was the source text of Elysia's `status` helper, and a `Response` returned from `onRequest` was logged as `ERROR` with status `200` whatever its own status was.
```

Commit it separately.

## Test plan

Six new tests (three apps × two `aot` values) in `hook-path-status.test.ts`, modelled on the `mapped errors` block in the same file. The existing `mapped errors` tests must stay green: they pin the thrown-error cases this hook also serves.

## Done criteria

- [ ] `cd packages/logixlysia && bun test` → 0 fail, at least 1562 pass
- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `git diff --stat origin/main..HEAD` lists only the three in-scope files
- [ ] `git log origin/main..HEAD --format=%B | grep -ciE 'co-authored|generated with|claude|devin|codex|gpt'` prints `0`
- [ ] `git status --short` is empty

## STOP conditions

- The `onAfterResponse` hook does not match the excerpt above.
- An existing test fails after Step 2 and the failure is not in the new block (for example a `mapped errors` case): report the test name and the logged values; do not adjust existing expectations.
- The fix needs a change outside the `onAfterResponse` hook.

## Maintenance notes

- Elysia 2 has no `error` alias on the context, so the `typeof` guard is a no-op there; CI runs the suite on the Elysia release candidate and must stay green.
- Reviewer: check that a thrown error answered by an app-wide `onError` (the `mapped errors` tests) still logs the mapped status.
