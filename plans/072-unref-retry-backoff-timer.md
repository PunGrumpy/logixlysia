# Plan 072: A pending adapter retry backoff no longer keeps the process alive

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/__tests__/adapters/shared.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

Every HTTP adapter (Axiom, Datadog, Loki, OTLP, and the rest) posts through `postWithRetry`. Between attempts it sleeps with a plain `setTimeout`. That timer is referenced, so a process that has finished its work, or an Elysia app after `app.stop()`, stays alive until the backoff elapses, up to 30 seconds per attempt when the server sent `Retry-After: 30`. The queue's own flush timer at `shared.ts:435` is already `unref`'d; the backoff timer is the inconsistency. Scripts and tests hang, and a container can overrun its termination grace period.

The smallest fix is to `unref` the backoff timer too, so a pending retry does not by itself keep the process alive. Nothing else changes: the retry still runs if anything else keeps the loop alive, and the shutdown flush still waits for `flushTimeoutMs`.

## Current state

`packages/logixlysia/src/adapters/shared.ts:169-174`:

```ts
const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms)
  return promise
}
```

The only caller is `retryOrRethrow` inside `attemptPost` (`:229-238`): `await sleep(delayMs)` then `return attemptPost(input, attempt + 1)`. `resolveRetryDelay` (`:203-215`) caps `Retry-After` at `MAX_RETRY_AFTER_MS = 30_000` (`:22`).

The pattern already used for the flush timer, `shared.ts:433-436`:

```ts
if (!timer) {
  timer = setTimeout(flushFromTimer, input.flushIntervalMs)
  timer.unref?.()
}
```

Tests: `packages/logixlysia/__tests__/adapters/shared.test.ts` imports `postWithRetry`, `resolveRetryDelay` and friends from `../../src/adapters/shared`, uses `stubFetch` from `./helpers.ts` (which swaps `globalThis.fetch` for a stub returning queued `{ status, headers, body }` responses) and already has "honors Retry-After on 429" at `:288`. A subprocess-based test exists in `__tests__/api/surface.test.ts` (`spawnSync(['bun', '-e', script], { cwd })`).

## Commands you will need

Run from the worktree root unless the row says otherwise. A fresh worktree has no `node_modules`; install first.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0, lockfile unchanged (`git status --short bun.lock` prints nothing) |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 (run before every commit) |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests (package) | `cd packages/logixlysia && bun test` | `0 fail`; 723 tests pass at the planned-at commit, plus the ones this plan adds |
| One test file | `cd packages/logixlysia && bun test __tests__/<area>/<file>.test.ts` | `0 fail` |
| Build | `bun run build` | exit 0, `packages/logixlysia/dist/` has 14 entries |

Notes that save time:

- `turbo` (used by `bun run typecheck`, `bun run build`, `bun run test` at the root) appends an "agent rules" block to `AGENTS.md` when it runs. Never commit that block. After any turbo run, `git checkout -- AGENTS.md` unless this plan tells you to edit `AGENTS.md` (then revert only the appended block).
- Lint is Ultracite (oxlint + oxfmt) with strict rules. Never add a disable comment, an ignore entry, or loosen a rule. Restructure the code until it passes. `bun run format` fixes formatting only.
- Tests use `bun:test` (`describe`, `test`, `expect`). Assert what a caller observes (a returned value, a written line, a transport call, a thrown error), not internals. Derive the expected value from the requirement, not from running the code.
- Comments: write none that narrate the code or the step. Keep a comment only for a non-obvious reason the code cannot show.

## Git workflow

- Start from commit `5115bea` (`origin/main`). In your worktree: `git checkout -B improve/<NNN>-<slug> 5115bea`. Do not branch from the worktree's initial HEAD, which is an unrelated docs branch.
- Conventional Commits, one commit per logical unit, in the order the steps are listed: `fix(<area>): <imperative subject>`, body explains why in two to four plain sentences. No `Co-Authored-By` or any attribution trailer. No "Generated with" line.
- Commit with signing off, per command: `git -c commit.gpgsign=false commit -m ...`. The session cannot reach the repository's signer.
- Every change under `packages/logixlysia/` needs a changeset unless this plan says otherwise: `.changeset/<slug>.md` containing

  ```
  ---
  'logixlysia': patch
  ---

  <one or two sentences, user-facing, past tense: what was wrong and what the user sees now>
  ```

  Commit the changeset together with the fix it describes.

- Do not push, do not open a PR, do not touch `plans/`. Your reviewer maintains the index and does the delivery.

## Scope

**In scope** (the only files you may modify):

- `packages/logixlysia/src/adapters/shared.ts` (only the `sleep` helper)
- `packages/logixlysia/__tests__/adapters/shared.test.ts`
- `.changeset/unref-retry-backoff.md` (create)

**Out of scope**: the retry budget, `MAX_RETRY_AFTER_MS`, queue capacity (`DEFAULT_MAX_PENDING_BATCHES`), the error-body read, and any adapter file. Each is a separate decision; do not bundle them.

## Steps

### Step 1: `unref` the backoff timer

Change `sleep` to keep the timer and call `timer.unref?.()`, matching the flush-timer pattern. No other code change.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters` → `0 fail`.

### Step 2: Prove a process with only a pending retry exits

Add one test to `shared.test.ts` that runs a `bun -e` subprocess (model it on the `spawnSync` usage in `__tests__/api/surface.test.ts`, `cwd` set to the package root so the import of `./src/adapters/shared` resolves). The script:

- replaces `globalThis.fetch` with a function returning `new Response('', { status: 429, headers: { 'retry-after': '30' } })`,
- calls `postWithRetry({ body: '{}', headers: {}, name: 'test', retries: 2, timeout: 1000, url: 'https://example.invalid/v1' })` without awaiting it, attaching `.catch(() => {})`,
- prints nothing else.

The test measures wall time around `spawnSync` and asserts the subprocess exits with code 0 in under 5 000 ms. Before your Step 1 change this takes about 30 s (confirm once by stashing the fix, running only this test, and restoring; mention the observed time in your report). Keep the test's own timeout above 5 s if `bun:test` needs it (`test(name, fn, 10_000)`).

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/shared.test.ts` → `0 fail`, and the new test's duration is well under 5 s.

Commit both steps as one: `fix(adapters): let a pending retry backoff exit with the process`.

### Step 3: Changeset, full gates

Create `.changeset/unref-retry-backoff.md` (`'logixlysia': patch`): an adapter waiting out a retry backoff (including a `Retry-After` delay) no longer keeps the process alive on its own; the queue's flush timer already behaved this way.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`.

## Test plan

One subprocess test as described. It asserts the user-visible behaviour (the process exits) rather than that `unref` was called.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 724 tests
- [ ] `grep -c "unref" packages/logixlysia/src/adapters/shared.ts` → `2`
- [ ] `git diff --stat 5115bea..HEAD` lists only the three in-scope paths

## STOP conditions

- The excerpts do not match the live file.
- With the fix applied the subprocess still takes more than 5 s (something else keeps it alive; report what the script does, do not add more `unref` calls).
- The subprocess cannot import `./src/adapters/shared` (report the error; do not copy code into the script).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- A retry that is the only thing left alive at exit is now abandoned, like the flush timer's pending batch. The shutdown path still waits `flushTimeoutMs` for in-flight sends, so an app that calls `app.stop()` keeps its guarantee.
- Deferred, with reasons: aborting pending retries on `close()` (needs an `AbortController` through `attemptPost`); bounding the total retry time; the 640-entry default queue cap; reading only a prefix of a large error body. Each is listed in `plans/README.md` under the backlog.
