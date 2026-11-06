# Plan 090: Head sampling keeps or drops a request as a whole, at the configured rate

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report. A reviewer dispatched you and maintains `plans/README.md`, so do not edit the index.
>
> **Drift check (run first)**: `git diff --stat 0873da0..HEAD -- packages/logixlysia/src/sampling/index.ts apps/docs/content/features/sampling.mdx`. If a file changed, compare the excerpts below with the live code; a mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (changes which records a sampled app keeps)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `0873da0`, 2026-11-06

## Why this matters

`decide()` rolls a fresh random number for each record. A dropped custom log leaves the access line in place, and the access line then gets its own roll, so the configured rate is not the rate users get. Measured on Bun 1.3.14 with 4000 requests:

| Config | Requests with a line, today | Rolling once per request |
| --- | --- | --- |
| `INFO: 10`, 1 custom log | 19.5% | 10.2% |
| `INFO: 10`, 3 custom logs | 35.5%, 102 requests with more than one line | 9.7%, always 0 or 3 lines |
| `INFO: 50`, 3 custom logs | 93.3% | 48.6% |

After this plan a request's trail is whole or absent, and the rate is honest.

## Current state

`packages/logixlysia/src/sampling/index.ts`:

```ts
const inFlight = new WeakSet<object>()
const rescued = new WeakSet<object>()

return {
  begin(key) {
    if (tail) {
      inFlight.add(key)
    }
  },
  ...
  decide(level, key) {
    if (rescued.has(key)) {
      return 'keep'
    }

    const rate = rates[level] ?? FULL_RATE
    if (rate >= FULL_RATE || (rate > 0 && random() * FULL_RATE < rate)) {
      return 'keep'
    }

    return tail && inFlight.has(key) ? 'buffer' : 'drop'
  },
```

- `begin` is reached through `logger.beginRequest` (`src/logger/index.ts:229`), which the plugin calls when it opens a request.
- `wrapWs` shares one cached `Request` per path and never calls `begin` (measured: 3 connections, 12 lines, 1 key). A sticky roll on that key would fix a path's fate for the life of the process, so keys without `begin` must keep rolling per record.
- `finalize` runs before the access line is written, so the roll must not be deleted there.
- `apps/docs/content/features/sampling.mdx:8` says sampling "is per-record and reversible", and `:12` says head sampling "decides as each record is emitted: keep `n%` of a level".
- Tests in `__tests__/sampling/` inject `random` as the second argument of `resolveSampling`.

## Commands you will need

| Purpose   | Command                                               | Expected |
| --------- | ----------------------------------------------------- | -------- |
| Install   | `bun install --frozen-lockfile`                       | exit 0   |
| Lint      | `bun run lint`                                        | exit 0   |
| Format    | `bun run format`                                      | exit 0   |
| Typecheck | `bun run typecheck`                                   | exit 0   |
| Tests     | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**: `packages/logixlysia/src/sampling/index.ts`, `packages/logixlysia/__tests__/sampling/*` (add `coherent.test.ts`; adjust an existing test only if it asserts independent rolls), `apps/docs/content/features/sampling.mdx`, `.changeset/coherent-head-sampling.md` (create).

**Out of scope**: `src/index.ts`, `src/websocket/*`, deterministic sampling across services, a per-request `level` key (rejected: one roll per request means requests kept at `DEBUG: 1` are a subset of those kept at `INFO: 10`), and `AGENTS.md` (turbo appends a block to it; run `git checkout -- AGENTS.md` before committing and stage by path).

## Git workflow

Branch `improve/090-coherent-head-sampling` from the worktree HEAD. Conventional commits with no attribution trailer, e.g. `feat(sampling): roll head sampling once per request`. Do not push.

## Steps

### Step 1: One roll per opened request

Add `const rolls = new WeakMap<object, number>()`. In `begin`, always run `rolls.set(key, random() * FULL_RATE)` (before the `tail` check). In `decide`, replace the expression:

```ts
const roll = rolls.get(key) ?? random() * FULL_RATE
if (rate >= FULL_RATE || (rate > 0 && roll < rate)) {
  return 'keep'
}
```

Do not delete the roll in `finalize`. Update the `SamplingRuntime.begin` doc comment to say it also fixes the request's roll.

**Verify**: `cd packages/logixlysia && bun test __tests__/sampling` passes. A prototype of this change ran the whole suite with no sampling failure. If a test fails, read it: adjust it only if it asserts independent rolls for a key with `begin`, and report which.

### Step 2: Tests

Create `__tests__/sampling/coherent.test.ts`:

1. `resolveSampling({ head: { INFO: 50 } }, () => 0.1)` with `begin(key)`: three `decide('INFO', key)` all `keep`, and `random` was called once (use a counter).
2. The same with `() => 0.9`: all three `drop` when no tail is set.
3. Subset property, random `0.05` (roll 5): `{ INFO: 10, DEBUG: 1 }` keeps `INFO`, drops `DEBUG`.
4. A key with no `begin` rolls per record: a sequence `0.1, 0.9` gives `keep`, then `drop`.
5. Tail rescue still works: `{ head: { INFO: 10 }, tail: { status: 500 } }` with a roll above the rate buffers, and `finalize` with status 500 returns the buffered records.
6. Plugin level, with `spyOn(Math, 'random')` returning `0.5` and `{ head: { INFO: 10 } }`: a handler with three `log.info` calls produces zero lines at a capture transport, including no access line. With `0.05` it produces exactly three lines. Restore the spy. Model the app on `buildApp` in `__tests__/sampling/plugin.test.ts`.

**Verify**: the new file passes, and cases 1, 2 and 6 fail against the old `decide` (check once with `git stash`-free means: temporarily change the line, then restore).

### Step 3: Docs and changeset

In `sampling.mdx`: line 8 becomes "is per-request and reversible". Line 12 says a request gets one roll when it opens, so all its records at a level are kept or dropped together, and kept low-rate levels are a subset of kept high-rate levels. Add one sentence that WebSocket lifecycle lines have no request to tie to and roll per record. Create `.changeset/coherent-head-sampling.md` with `'logixlysia': minor`: a sampled app now keeps close to the configured share of requests, where an access line used to get a second chance after its custom log was dropped, so counts may fall.

**Verify**: `bun run format`, then `bun run lint` exits 0.

## Test plan

The six cases in Step 2. Existing sampling and plugin suites stay green.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0.
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the new tests.
- [ ] `grep -n "per-record" apps/docs/content/features/sampling.mdx` returns nothing.
- [ ] `git status` shows only in-scope files; `AGENTS.md` is unchanged.

## STOP conditions

- `beginRequest` is reached for a key that lives past one unit of work (a socket, a shared `Request`). That breaks the premise of the gate.
- A test unrelated to sampling fails because of this change.

## Maintenance notes

A long-lived key must never call `begin`. `runJob` uses a fresh key per run, so a job is coherent. A reviewer should confirm `finalize` leaves the roll in place, since the access line decides after it.
