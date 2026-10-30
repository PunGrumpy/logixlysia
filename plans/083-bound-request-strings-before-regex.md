# Plan 083: Tail-sampling globs and the user-agent parser cannot be pinned by a crafted request

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat e27dd76..HEAD -- packages/logixlysia/src/sampling/glob.ts packages/logixlysia/src/sampling/index.ts packages/logixlysia/src/enrichers.ts packages/logixlysia/__tests__/sampling packages/logixlysia/__tests__/enrichers/built-ins.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e27dd76`, 2026-10-30

## Why this matters

Two regexes run synchronously on request-supplied strings with no length bound.

1. A tail-sampling glob turns each single `*` into `[^/]*`. With three or more single stars inside one path segment (`/api/*-*-*.png`, `*.*.*.js`) the anchored regex backtracks polynomially on a long path: measured 52 ms at 800 dashes, 395 ms at 1,600, and `/files/*-*-*-*-*.png` against 2,000 dashes did not finish in 100 s. A 16 KB URL is within normal header limits, so one GET can pin the event loop. The guard in `glob.ts` only rejects repeated `**`.
2. The user-agent enricher's Safari pattern `version\/([\d.]+).*safari` is quadratic on `version/` followed by digits: 6.7 ms at 4,000 characters, 98.9 ms at 16,000.

Fix both at the boundary: reject a glob with more than two single stars in one segment at startup (clear error, like the existing `**` guard), skip path rules for a pathname longer than 2,048 characters, and parse at most 512 characters of a user agent.

## Current state

- `packages/logixlysia/src/sampling/glob.ts` (59 lines). Lines 9-26 `hasRepeatedRecursiveWildcards`; lines 28-33 throw `'Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues'`; lines 41-46 emit `.*` for `**` and `[^/]*` for `*`; line 58 returns `new RegExp(`^${source}$`, 'u')`.
- `packages/logixlysia/src/sampling/index.ts:76-91` `matchesTail` runs `path.test(outcome.pathname)` for each compiled path; `RequestOutcome` (lines 31-35) is `{ durationMs, pathname, status }`. `resolveTail` (around lines 60-74) compiles `tail.paths` with `globToRegExp`, so a throw surfaces at plugin construction. `src/config/resolve-options.ts:95-104` only checks the paths are non-empty strings.
- `packages/logixlysia/src/enrichers.ts:105-112` `BROWSERS` with the Safari pattern at line 111; `userAgentEnricher` (lines 156-175) reads `request.headers.get('user-agent')` and runs `BOT.test`, `matchName(BROWSERS, value)`, `matchName(OPERATING_SYSTEMS, value)` and `resolveDevice` on the raw value.
- Tests: `__tests__/sampling/glob.test.ts` (`globToRegExp` unit tests; look for the existing `**` rejection test with `grep -n toThrow`), `__tests__/sampling/runtime.test.ts` (`resolveSampling` with an `outcome()` helper), `__tests__/enrichers/built-ins.test.ts` (`describe('userAgentEnricher')` from line 111 with real UA strings).

## Commands you will need

| Purpose | Command (repo root unless noted) | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` | exit 0 |
| Focused | `cd packages/logixlysia && bun test __tests__/sampling __tests__/enrichers` | pass |
| All tests | `cd packages/logixlysia && bun test` | all pass (758 at baseline) |

## Scope

**In scope**:

- `packages/logixlysia/src/sampling/glob.ts`
- `packages/logixlysia/src/sampling/index.ts`
- `packages/logixlysia/src/enrichers.ts`
- `packages/logixlysia/__tests__/sampling/glob.test.ts`, `__tests__/sampling/runtime.test.ts`, `__tests__/enrichers/built-ins.test.ts`
- `apps/docs/content/features/sampling.mdx` (one sentence on the star limit, next to where `paths` globs are described; find it with `grep -n "paths" apps/docs/content/features/sampling.mdx`)
- `.changeset/bound-glob-and-user-agent.md` (create)

**Out of scope**: `src/config/resolve-options.ts` (validation stays in `globToRegExp`), `src/logger/emit.ts` (`parseRequestUrlOnce` display path), `src/utils/redact.ts`, `src/index.ts`.

## Git workflow

- Branch `improve/083-bound-glob-and-user-agent` from `e27dd76`.
- Commits: `fix(sampling): reject globs with more than two stars in a segment and skip over-long paths`, then `fix(enrichers): parse at most 512 characters of a user agent`.
- `git -c commit.gpgsign=false commit …`; no trailers. Do not push.

## Steps

### Step 1: Failing glob tests

In `glob.test.ts`:

1. `rejects more than two single stars in one segment`: `expect(() => globToRegExp('/api/*-*-*.png')).toThrow('single wildcards')`; `'/a/*-*/b/*-*'` (two per segment) does not throw.
2. `matches a two-star segment on a long path in bounded time`: `globToRegExp('/api/*-*.png').test('/api/' + '-'.repeat(2000))` returns `false` and takes under 50 ms (`performance.now()` bracket).

In `runtime.test.ts`: 3. `skips path rules for a pathname longer than 2048 characters`: `resolveSampling({ head: { INFO: 0 }, tail: { paths: ['/api/**'] } })`, `begin(key)`, `finalize(key, outcome({ pathname: '/api/' + 'a'.repeat(3000) }))` returns no records (not rescued), while a 100-character `/api/...` path is rescued.

**Verify**: 1 fails (no throw), 3 fails (rescued), 2 passes already.

### Step 2: Glob guard and path cap

- `glob.ts`: add `const MAX_SINGLE_WILDCARDS_PER_SEGMENT = 2` and a check (split the pattern on `/`, count `*` that are not part of `**` per segment) that throws `'Invalid glob pattern: more than two single wildcards (*) in one segment can cause performance issues'`.
- `sampling/index.ts`: add `const MAX_MATCHED_PATHNAME_LENGTH = 2048`; in `matchesTail`, test paths only when `outcome.pathname.length <= MAX_MATCHED_PATHNAME_LENGTH`.

**Verify**: `cd packages/logixlysia && bun test __tests__/sampling` → all pass.

### Step 3: Failing user-agent test, then the cap

In `built-ins.test.ts` under `describe('userAgentEnricher')`: `bounds the work on a very long user agent`: `'Version/' + '1'.repeat(16000)` → `request?.()` returns within 20 ms (`performance.now()` bracket) and still reports `bot: false`. Also `still parses a normal UA that happens to be long` with a real Chrome UA padded with 600 spaces of extra tokens at the end → `browser: 'Chrome'` (the browser token is within the first 512 characters).

Then in `enrichers.ts`: `const MAX_USER_AGENT_LENGTH = 512`; `const value = raw.slice(0, MAX_USER_AGENT_LENGTH)` before any regex in `userAgentEnricher`.

**Verify**: the first test fails before the cap (takes about 100 ms) and passes after; `cd packages/logixlysia && bun test __tests__/enrichers` all pass.

### Step 4: Docs, changeset, suite

- `features/sampling.mdx`: one sentence: a glob may use at most two single `*` in one path segment; use `**` or `?` for broader matches.
- `.changeset/bound-glob-and-user-agent.md`:

```md
---
'logixlysia': patch
---

A tail-sampling glob with more than two single `*` wildcards in one path segment is now rejected at startup, and path rules skip pathnames longer than 2048 characters, so a crafted URL can no longer pin the event loop in the matcher. `userAgentEnricher` parses at most the first 512 characters of the header.
```

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0; `cd packages/logixlysia && bun test` all pass.

## Test plan

- Five tests across the three test files (Steps 1 and 3).

## Done criteria

- [ ] Lint, typecheck exit 0; suite passes with 5 new tests
- [ ] `grep -n "MAX_SINGLE_WILDCARDS_PER_SEGMENT" packages/logixlysia/src/sampling/glob.ts`, `grep -n "MAX_MATCHED_PATHNAME_LENGTH" packages/logixlysia/src/sampling/index.ts`, `grep -n "MAX_USER_AGENT_LENGTH" packages/logixlysia/src/enrichers.ts` all match
- [ ] Changeset present; no files outside scope

## STOP conditions

- The excerpts do not match.
- An existing test or docs example uses a glob with three single stars in one segment (report it; do not loosen the limit).
- The timing assertions are flaky on the second run (report the numbers; the reviewer may raise the bounds).

## Maintenance notes

- Reviewer: check the star count ignores `**`, and that a pathname over the cap is only excluded from path rules (status and duration rules still apply).
- A linear-time matcher would remove the star limit; not worth it until someone needs such a pattern.
