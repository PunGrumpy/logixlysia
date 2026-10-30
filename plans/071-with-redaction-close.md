# Plan 071: `withRedaction` forwards `close` and drops records after it

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/desertant.ts packages/logixlysia/__tests__/adapters/desertant.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

`withRedaction(transport, model)` wraps any transport so records pass through a redaction model before delivery. The wrapper returns only `{ flush, log }`, so the wrapped transport's `close` disappears. `flushLogixlysia(options, { close: true })` calls `transport.close?.()` on every configured transport; for a wrapped Axiom, Datadog or custom transport nothing is called, its sockets and timers stay open, and its "closed" gate is never set. The `Transport` contract (`src/types/config.ts:6-12`) also says that after `close` resolves, further `log()` calls should be dropped rather than queued.

## Current state

`packages/logixlysia/src/desertant.ts`:

- `:1` imports `AdapterTransport` from `./adapters/shared` (a type with optional `flush`/`close`).
- `:81-84`:

  ```ts
  /** A {@link Transport} whose records pass through the model before delivery. */
  export interface RedactingTransport extends Transport {
    /** Awaits the records already queued, then flushes the wrapped transport. */
    flush: () => Promise<void>
  }
  ```

- `:245-272` `createQueue(maxQueue)` returns `{ drain: () => tail, push: (task) => boolean }`; `push` returns `false` when `pending >= maxQueue`.
- `:296-396` `withRedaction`. Its `log` (around `:340-388`) builds a task, calls `queue.push(task)` and reports `queueFullError(maxQueue)` when not accepted. The return value at `:390-396`:

  ```ts
    return {
      flush: async () => {
        await queue.drain()
        await (transport as Partial<AdapterTransport>).flush?.()
      },
      log
    }
  }
  ```

`packages/logixlysia/src/types/config.ts:5-27` is the `Transport` interface: optional `close`, optional `flush`, required `log`.

Test file: `packages/logixlysia/__tests__/adapters/desertant.test.ts`. It has `createSink()` (`:12-21`) returning a `Transport` that records calls, `createStubRedactor()` (`:33-`) that replaces `Anna Müller` with `[GIVEN_NAME_1]`, and tests that call `await transport.flush()` (`:57`, `:71`, `:90`). Follow its style.

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

- `packages/logixlysia/src/desertant.ts`
- `packages/logixlysia/__tests__/adapters/desertant.test.ts`
- `.changeset/with-redaction-close.md` (create)

**Out of scope**: `src/adapters/shared.ts` (another plan edits it this round), `src/utils/redact.ts` (plan 073), `src/types/config.ts`, the API snapshot under `__tests__/api` (the wrapper's shape changes only by adding an optional method that the snapshot of named exports does not record; if the snapshot test fails, STOP).

## Steps

### Step 1: Forward `close` and drop records after it

In `withRedaction`:

- Add `let closed = false` beside `queue`.
- In `log`, before queueing: if `closed`, return without queueing and without reporting (the contract says drop). Keep the rest as is.
- Return `close` alongside `flush` and `log`:

  ```ts
  close: async () => {
    closed = true
    await queue.drain()
    await (transport as Partial<AdapterTransport>).close?.()
  }
  ```

  `close` must be idempotent: a second call drains again (a no-op) and calls the inner `close` again, which the contract requires to be idempotent itself. Do not add a guard that skips the inner call.

- Extend `RedactingTransport` with `close: () => Promise<void>` and a one-line doc: "Awaits the queued records, closes the wrapped transport, then drops later records."

Tests (add to `desertant.test.ts`, using `createSink` extended with a `closed` counter and a `close` method, or a local sink):

- "close() delivers the queued records, then closes the wrapped transport once": log one record, call `close()`, assert the sink has the redacted record and `closed === 1`, and that the record arrived before `closed` was incremented (record the order in an array).
- "records logged after close() are dropped": after `close()`, call `log('INFO', 'late')`, then `await transport.flush()`, assert the sink still has one record and `onError` (pass a mock) was not called.
- "close() works for a wrapped transport without close": wrap `createSink()` as is, `await transport.close()` resolves.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters/desertant.test.ts` → `0 fail`.

Commit: `fix(desertant): forward close through withRedaction and drop records after it`.

### Step 2: Changeset, full gates

Create `.changeset/with-redaction-close.md` (`'logixlysia': patch`): a transport wrapped with `withRedaction` now exposes `close`, which drains the queue, closes the wrapped transport and drops later records.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`. `git status --short` shows only in-scope paths.

## Test plan

Three new tests in `__tests__/adapters/desertant.test.ts`, listed above. All assert through the public `withRedaction` result and the wrapped sink's observable calls.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 726 tests
- [ ] `grep -n "close" packages/logixlysia/src/desertant.ts` shows the new `close` in `RedactingTransport` and in the returned object
- [ ] `git diff --stat 5115bea..HEAD` lists only the three in-scope paths

## STOP conditions

- The excerpts do not match the live file.
- The API snapshot test (`__tests__/api/surface.test.ts`) fails after your change (it should not; the export names are unchanged).
- Adding `close` to `RedactingTransport` breaks a type elsewhere in `src/` (that would mean something builds a `RedactingTransport` by hand; report where).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `createQueue` has no "closed" state of its own; the flag lives in `withRedaction`. If the queue grows a `close`, move the flag there.
- Reviewer: check the order assertion in the first test really proves records drain before the inner `close` is called.
