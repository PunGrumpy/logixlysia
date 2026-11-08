# Plan 100: A full adapter queue keeps the louder entry; one `LOG_LEVELS` table; `logixlysia/http` exports `LogLevel`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 91fd02f..HEAD -- packages/logixlysia/src/adapters/shared.ts packages/logixlysia/src/output/index.ts packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/src/http.ts packages/logixlysia/src/helpers packages/logixlysia/__tests__/adapters/http.test.ts apps/docs/content/adapters/overview.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `91fd02f`, 2026-11-08

## Why this matters

Every built-in adapter and `createHttpTransport` share `createBatchQueue`. When a send is in flight and `maxPendingBatches × maxBatchSize` entries (640 by default) are waiting, the next entry is dropped whatever its level. Measured with `maxBatchSize: 2, maxPendingBatches: 2` and a held `fetch`: after `INFO a, b` started a send and `DEBUG d1..d4` filled the queue, `ERROR the outage` was dropped and `onDropped` fired once. A burst of debug lines costs the one line the operator needed. The fix: on a full queue, an entry that outranks the quietest waiting entry takes the place of the oldest entry at that quietest level. `onDropped({ count: 1, reason: 'queue-full' })` fires either way, so the loss stays counted.

The level order is written three times (`adapters/shared.ts`, `output/index.ts`, `config/resolve-options.ts`). One import-free table replaces them. `logixlysia/http` also gains `export type { LogLevel }`, so a custom transport author can type `(level: LogLevel) =>` from the subpath they already import.

## Current state

- `packages/logixlysia/src/adapters/shared.ts` line 6: `const LOG_LEVELS: readonly LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR']`, used at lines 583-587 to validate `minLevel`. `createBatchQueue` (lines 348-471) keeps `let buffer: LogEntry[]`, counters `dropped`, `accepted`, `settled`, and:

```ts
  const push = (entry: LogEntry): Promise<void> | undefined => {
    if (inFlight && buffer.length >= maxWaiting) {
      dropped += 1
      notifyDropped(input.onDropped, 1, 'queue-full')
      return
    }
    buffer.push(entry)
    accepted += 1
    ...
```

`flush()` is `drainUntil(accepted)`, which keeps sending until `settled >= accepted`; `runSend` adds `entries.length` to `settled` in its `finally`. An evicted entry was already counted in `accepted`, so eviction must also do `settled += 1`, or `flush()` never reaches its target and loops `startSend()` on an empty buffer, POSTing empty batches.

- `packages/logixlysia/src/output/index.ts` lines 44-54:

```ts
const LEVEL_RANK: Record<LogLevel, number> = {
  DEBUG: 0,
  ERROR: 3,
  INFO: 1,
  WARNING: 2
}

const isBelowMinLevel = (
  level: LogLevel,
  minLevel: LogLevel | undefined
): boolean => minLevel !== undefined && LEVEL_RANK[level] < LEVEL_RANK[minLevel]
```

- `packages/logixlysia/src/config/resolve-options.ts` line 58: `const VALID_SAMPLING_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const`, used at lines 105 and 161.
- `packages/logixlysia/src/helpers/status.ts` imports `elysia`, so the table cannot live there (every adapter bundle would pull Elysia in). `src/types/core.ts` defines `LogLevel` and imports only pino types.
- `packages/logixlysia/src/http.ts` re-exports `createHttpTransport`, `entryText` and the types `AdapterTransport`, `BatchTransportOptions`, `HttpTransportInput`, `LogEntry`.
- `packages/logixlysia/__tests__/adapters/http.test.ts` tests `createHttpTransport` with `stubFetch` from `./helpers`; `__tests__/adapters/shared.test.ts` has `describe('onDropped')` tests that push same-level entries and expect two `queue-full` drops; they must keep passing (same level never evicts).
- `apps/docs/content/adapters/overview.mdx` around line 90: "Once `maxPendingBatches × maxBatchSize` entries are waiting, new entries are dropped and reported rather than buffered forever." and a "Counting lost entries" section describing `'queue-full'` with `count` 1.
- Conventions: Ultracite lint, `bun:test`, comments only for a non-obvious why, changeset required. Test behavior through `createHttpTransport`, not `createBatchQueue`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `bun run lint` (repo root) | exit 0 |
| Format | `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 |
| Build + tests | `cd packages/logixlysia && bun run build && bun test` | all pass |
| Adapter tests | `cd packages/logixlysia && bun test __tests__/adapters` | all pass |

Run `git checkout -- AGENTS.md` before every commit and stage by path.

## Scope

**In scope**:

- `packages/logixlysia/src/helpers/level.ts` (create)
- `packages/logixlysia/src/adapters/shared.ts`
- `packages/logixlysia/src/output/index.ts`
- `packages/logixlysia/src/config/resolve-options.ts`
- `packages/logixlysia/src/http.ts`
- `packages/logixlysia/__tests__/adapters/http.test.ts`
- `apps/docs/content/adapters/overview.mdx`
- `.changeset/queue-evicts-quieter-entries.md` (create)

**Out of scope**:

- `packages/logixlysia/src/desertant.ts`: its queue holds closures, not leveled entries.
- The queue size defaults and any new option.
- The API snapshot: a type-only export does not appear in it.

## Git workflow

- Branch from `91fd02f`: `improve/100-queue-evicts-quieter-entries`.
- Commits: `refactor(levels): one LOG_LEVELS table for adapters, output and config`, `fix(adapters): keep an ERROR when a full queue holds quieter entries`, `feat(http): export LogLevel from logixlysia/http`, then `docs(adapters): describe which entry a full queue drops`.
- No push, no PR.

## Steps

### Step 1: One level table

Create `packages/logixlysia/src/helpers/level.ts`:

```ts
import type { LogLevel } from '../types/core'

/** Every level, quietest first. A level's rank is its index. */
export const LOG_LEVELS: readonly LogLevel[] = [
  'DEBUG',
  'INFO',
  'WARNING',
  'ERROR'
]

export const levelRank = (level: LogLevel): number => LOG_LEVELS.indexOf(level)

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
```

Then:

- `adapters/shared.ts`: delete the local `LOG_LEVELS` and import it from `../helpers/level`.
- `output/index.ts`: delete `LEVEL_RANK`, import `levelRank`, and write `isBelowMinLevel` as `minLevel !== undefined && levelRank(level) < levelRank(minLevel)`.
- `config/resolve-options.ts`: delete `VALID_SAMPLING_LEVELS`, import `isLogLevel` and `LOG_LEVELS`, use `isLogLevel(level)` at line 105 and `level.every(isLogLevel)` at line 161; keep the error texts unchanged (they list the levels by name).

**Verify**: `bun run typecheck` → exit 0; `cd packages/logixlysia && bun test __tests__/adapters __tests__/config __tests__/output` → all pass; `grep -rn "'DEBUG', 'INFO', 'WARNING', 'ERROR'" packages/logixlysia/src` matches only `helpers/level.ts`.

### Step 2: Eviction on a full queue

In `createBatchQueue` in `adapters/shared.ts`, add a helper inside the closure:

```ts
/** Drops the oldest entry at the quietest waiting level when `level` outranks it. */
const evictQuieter = (level: LogLevel): boolean => {
  let quietest = Number.POSITIVE_INFINITY
  let index = -1
  for (const [position, waiting] of buffer.entries()) {
    const rank = levelRank(waiting.level)
    if (rank < quietest) {
      quietest = rank
      index = position
    }
  }
  if (index === -1 || levelRank(level) <= quietest) {
    return false
  }
  buffer.splice(index, 1)
  return true
}
```

Change `push`:

```ts
  const push = (entry: LogEntry): Promise<void> | undefined => {
    if (inFlight && buffer.length >= maxWaiting) {
      dropped += 1
      notifyDropped(input.onDropped, 1, 'queue-full')
      if (!evictQuieter(entry.level)) {
        return
      }
      // The evicted entry was accepted and will never be sent.
      settled += 1
    }
    buffer.push(entry)
    accepted += 1
    ...
```

Update the `maxPendingBatches` JSDoc in `BatchTransportOptions`: "...entries beyond that are dropped and reported. A new entry that outranks the quietest waiting entry takes the place of the oldest entry at that level instead." Import `levelRank` next to `LOG_LEVELS`.

**Verify**: `cd packages/logixlysia && bun test __tests__/adapters` → all pass (the `shared.test.ts` onDropped tests push one level and still see two drops).

### Step 3: `LogLevel` from `logixlysia/http`

In `src/http.ts` add `export type { LogLevel } from './interfaces'`.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

In `__tests__/adapters/http.test.ts`, change `import type { LogEntry } from '../../src/http'` to `import type { LogEntry, LogLevel } from '../../src/http'` and give the `entry` helper a `level: LogLevel = 'INFO'` parameter, so the type export is exercised by the typecheck.

Add a `describe('a full queue')` with a held fetch. Pattern:

```ts
const heldFetch = () => {
  const bodies: string[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>(resolve => {
    release = resolve
  })
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body))
    await gate
    return new Response('ok')
  }) as typeof fetch
  return {
    bodies,
    release,
    restore: () => {
      globalThis.fetch = original
    }
  }
}
```

and a transport with `body: entries => entries.map(e => `${e.level}:${e.message}`).join(',')`, `options: { flushIntervalMs: 60_000, maxBatchSize: 2, maxPendingBatches: 2, onDropped }`. Log `INFO a`, `INFO b` (starts the send), `await Bun.sleep(5)`, then the scenario, then `release()` and `await transport.flush()`.

1. "an ERROR arriving at a full DEBUG queue takes the oldest DEBUG's place": after `DEBUG d1..d4`, log `ERROR the outage`. `bodies.join('|')` contains `ERROR:the outage` and not `DEBUG:d1`, and contains `DEBUG:d2,DEBUG:d3` before `DEBUG:d4,ERROR:the outage`; `onDropped` was called once with `{ count: 1, reason: 'queue-full' }`.
2. "a full ERROR queue drops the newcomer": `ERROR e1..e4` then `WARNING late` → bodies do not contain `late`, `onDropped` once.
3. "flush resolves after an eviction and sends no empty batch": in scenario 1, `await transport.flush()` resolves (wrap in a 2 s timeout race and expect the flush to win) and every element of `bodies` is a non-empty string; `bodies.length` is 3 (the in-flight `a,b`, then two batches of two, since `maxEntriesPerRequest` defaults to 500 but the queue drains per `takeBatch`; if the implementation yields a different non-empty count, assert `bodies.every(body => body.length > 0)` and the total number of entries across bodies equals 6).
4. "a same-level newcomer is dropped as before": `INFO i1..i4` then `INFO i5` → bodies do not contain `i5`.

Check tests 1 and 3 fail against the unfixed source once (stash, run, pop; test 3 against the unfixed source is expected to pass, say so) and report.

**Verify**: `cd packages/logixlysia && bun run build && bun test` → all pass.

### Step 5: Docs and changeset

`apps/docs/content/adapters/overview.mdx`: change the sentence around line 90 to: "Once `maxPendingBatches × maxBatchSize` entries are waiting, a new entry is dropped and reported rather than buffered forever, unless it outranks the quietest entry waiting: then the oldest entry at that quietest level is dropped instead, so an `ERROR` is not lost to a burst of `DEBUG` lines." In "Counting lost entries", keep `'queue-full'` with `count` 1 and add "whichever entry was dropped".

Create `.changeset/queue-evicts-quieter-entries.md`:

```md
---
'logixlysia': patch
---

When an adapter's queue is full, a new entry that outranks the quietest waiting entry now takes the place of the oldest entry at that level, so an `ERROR` is not lost to a burst of `DEBUG` lines. `onDropped` still counts every dropped entry. `logixlysia/http` exports the `LogLevel` type.
```

Run `bun run format` at the repo root.

**Verify**: `bun run lint && bun run typecheck` → exit 0.

## Test plan

- `__tests__/adapters/http.test.ts`: four new tests through `createHttpTransport`, plus the `LogLevel` import.
- Existing `__tests__/adapters/shared.test.ts`, `__tests__/config`, `__tests__/output/min-level.test.ts` unchanged and passing.
- `cd packages/logixlysia && bun run build && bun test` → all pass.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun run build && bun test` exits 0
- [ ] `grep -rn "'DEBUG', 'INFO', 'WARNING', 'ERROR'" packages/logixlysia/src` matches only `helpers/level.ts`
- [ ] `grep -n "LEVEL_RANK\|VALID_SAMPLING_LEVELS" -r packages/logixlysia/src` returns nothing
- [ ] `grep -n "LogLevel" packages/logixlysia/src/http.ts` matches
- [ ] `git status --short` lists only in-scope files
- [ ] `.changeset/queue-evicts-quieter-entries.md` exists with `'logixlysia': patch`

## STOP conditions

- The `push` excerpt does not match `adapters/shared.ts`.
- `flush()` hangs or POSTs an empty body in test 3 after `settled += 1` is in place.
- An adapter bundle (`dist/axiom.js` etc.) starts importing `elysia` after step 1 (check with `grep -l "from \"elysia\"" packages/logixlysia/dist/*.js`, which must list only `index.js`).

## Maintenance notes

- The scan runs only on the full-queue path, at most 640 entries by default.
- Desertant's `withRedaction` queue still drops the newest; it has no levels to compare.
- Any new place that needs the level order imports `helpers/level.ts`; do not write the list again.
