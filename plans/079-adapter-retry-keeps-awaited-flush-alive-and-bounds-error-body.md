# Plan 079: An awaited `flush()` or `close()` keeps the retry timer alive, and an error body is read to 1 KB at most

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/__tests__/adapters/shared.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

Two defects in the shared adapter transport, both small.

1. PR #545 (plan 072) `unref`'d the retry backoff timer so a pending retry does not keep a process alive. It unref'd it on every path, including the one a caller is awaiting. The documented shutdown pattern is "call `flush()` or `close()` before exit". When that call is the only pending work, for example `transport.flush().then(exit)` in a CLI, a worker or a test, and the first attempt gets a 503, the process exits during the backoff with code 0, no output and no error. The batch is lost silently. Reproduced: a 503-then-200 server and `t.flush().then(...)` with no top-level await exited with nothing sent; the same script with `await t.flush()` completed. The timer must stay ref'd while a `flush()`/`close()` promise is outstanding and may be unref'd only for background sends.

2. On a non-2xx response the transport reads the whole body with `response.text()` and then keeps 200 characters. A server that streams an endless error body is bounded only by the request timeout (default 5 s, configurable to 2^31-1 ms). Reproduced: 1.7 GB of RSS growth within a 2 s timeout. Read at most 1 KB and cancel the rest.

## Current state

`packages/logixlysia/src/adapters/shared.ts`:

- `sleep` (lines 169-175) always unrefs:

```ts
const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  const timer = setTimeout(resolve, ms)
  timer.unref?.()
  return promise
}
```

- `attemptPost(input, attempt)` (lines 226-280) calls `await sleep(delayMs)` inside `retryOrRethrow` (line 237). `postWithRetry` (line 282) is `attemptPost(input, 0)`. `PostWithRetryInput` (lines 177-184) is `{ body, headers, name, retries, timeout, url }`.
- `readBodyText` (lines 218-224) is `await response.text()`; line 266-267 slices to `ERROR_BODY_PREVIEW_LENGTH = 200` (constant at line 28).
- The batch queue (`createBatchQueue`, from line ~320): `runSend(entries, background)` (lines 361-381) calls `await input.send(entries)`; `startSend` (383-387) runs `runSend(takeBatch(), false)` for an awaited drain; the `finally` block starts the next batch with `runSend(takeBatch(), true)` (background). `flush` (411-417) → `drainUntil(accepted)`.
- `createHttpTransport` (from line ~446) builds `send: entries => postWithRetry({ body: input.body(entries), headers, name, retries, timeout, url })` (around lines 535-545). Find the exact lines with `grep -n "postWithRetry(" src/adapters/shared.ts`.
- `BatchQueue` interface (lines 285-288) and the `send` input type: `grep -n "send:" src/adapters/shared.ts`.
- Test exemplar: `packages/logixlysia/__tests__/adapters/shared.test.ts`. It already spawns child processes (`spawnSync` from `bun`, `packageRoot`, `MAX_EXIT_MS = 5000`) for the plan 072 exit-time test; find it with `grep -n "spawnSync" __tests__/adapters/shared.test.ts` and model the new subprocess test on it. `stubFetch` lives in `__tests__/adapters/helpers.ts`.

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format | `bun run lint`, `bun run format` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| One file | `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/adapters/shared.ts`
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `.changeset/adapter-flush-keeps-retry-alive.md` (create)

**Out of scope**: the nine adapter files, `src/adapters/otlp-core.ts`, `src/desertant.ts` (plan 078), docs pages. Do not add an abort controller or a close timeout; that is a separate design.

## Git workflow

- Branch `improve/079-adapter-flush-keeps-retry-alive` from `e27dd76`.
- Two commits: `fix(adapters): keep the retry timer alive while flush or close is awaited`, then `fix(adapters): read at most 1 KB of an error body`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing subprocess test for the lost batch

In `shared.test.ts`, next to the existing exit-time test, add `an awaited flush survives a retry backoff when nothing else keeps the process alive`:

- The child script (run with `bun -e` or a temp file as the existing test does) starts a `Bun.serve` that answers 503 on the first POST and 200 on the second, creates `createHttpTransport({ body: JSON.stringify, headers: {}, name: 't', options: { retries: 1, flushIntervalMs: 60_000 }, url })`, logs one entry, then calls `transport.flush().then(() => { console.log('sent:' + count); server.stop(true) })` with **no** top-level await.
- The parent asserts the child's stdout contains `sent:2` (two POSTs) and the exit code is 0, within `MAX_EXIT_MS`.

**Verify**: fails on the current code (stdout empty, the process exits during the backoff).

### Step 2: Keep the timer ref'd during an awaited drain

- Give `sleep` a second parameter: `sleep(ms, keepAlive: boolean)`; call `timer.unref?.()` only when `keepAlive` is false.
- Add `keepAlive?: boolean` to `PostWithRetryInput` (default false) and pass it to `sleep` in `retryOrRethrow`.
- Change the queue's `send` signature to `(entries: LogEntry[], keepAlive: boolean) => Promise<void>` and call it as `input.send(entries, !background)` from `runSend`. Update `createHttpTransport`'s `send` to forward `keepAlive` into `postWithRetry`.
- Check other callers of `createBatchQueue` with `grep -rn "createBatchQueue(" src __tests__`; update any test that passes a `send` mock only if its type no longer compiles (an extra ignored parameter compiles fine).

**Verify**: Step 1's test passes; the existing plan 072 exit-time test still passes (a background retry still exits promptly).

### Step 3: Failing test for the bounded body

Add `reads at most 1 KB of an error body`:

- Stub `fetch` (use `stubFetch` or a `mock.module`-free local stub) to return a `Response` with status 400 whose body is a `ReadableStream` that enqueues 64 KB chunks forever (keep a counter of pulls).
- Call `postWithRetry({ …, retries: 0, timeout: 2000 })`, expect it to reject with a message containing `HTTP 400`, and assert the stream was pulled a small number of times (for example `<= 2`) rather than until the timeout.

**Verify**: fails on the current code (rejects only at the timeout, or the pull count is large).

### Step 4: Bounded read

Replace `readBodyText` with a reader loop: `response.body?.getReader()`, `TextDecoder`, accumulate until `>= ERROR_BODY_MAX_READ` (new constant, 1024) or `done`, then `await settle(reader.cancel())`. Return the accumulated text; keep the 200-char slice at the call site. Keep the `try/catch` that returns `''` on failure.

**Verify**: Step 3's test passes; existing tests asserting the error detail (grep `HTTP 4` in the test file) still pass.

### Step 5: Changeset, lint, suite

`.changeset/adapter-flush-keeps-retry-alive.md`:

```md
---
'logixlysia': patch
---

An awaited adapter `flush()` or `close()` now keeps the retry backoff timer alive, so a process whose only pending work is that call no longer exits in the middle of a retry and loses the batch. A background retry still lets the process exit. An error response body is now read to 1 KB at most instead of in full.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Steps 1 and 3 in `__tests__/adapters/shared.test.ts`.
- Existing exit-time and error-detail tests unchanged.

## Done criteria

- [ ] Lint, typecheck exit 0; full suite passes with 2 new tests
- [ ] `grep -n "await response.text()" packages/logixlysia/src/adapters/shared.ts` returns no match
- [ ] The subprocess test prints `sent:2` and exits 0 in under 5 s
- [ ] Changeset present; no files outside scope

## STOP conditions

- The `sleep`, `readBodyText` or `runSend` excerpts do not match.
- Keeping the timer ref'd during an awaited flush makes the existing plan 072 exit-time test exceed `MAX_EXIT_MS` (it should not; if it does, report).
- The bounded read needs changes to the `settle` helper or to `Response` handling in any adapter file.

## Maintenance notes

- Reviewer: confirm `keepAlive` is `true` only for the batch started by `startSend` (an awaited drain) and `false` for the `finally` continuation; confirm a background retry still exits the process promptly.
- Deferred: aborting pending retries on `close()` and a total retry budget (index, deferred list).
