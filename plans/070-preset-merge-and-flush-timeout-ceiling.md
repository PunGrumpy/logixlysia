# Plan 070: Preset values survive explicit `undefined` keys, dead preset merges go, and `flushTimeoutMs` gets the timer ceiling

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/__tests__/config/resolve-options.test.ts` must print nothing (you branch from `5115bea`, so it will). If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

`preset: 'prod'` is the one-line way to turn on redaction and request ids. A wrapper that forwards optional settings, such as `autoRedact: env.REDACT ? true : undefined`, silently turns redaction back off, because the merge spreads `undefined` over the preset value. The doc on `resolveOptions` says "explicit `config` keys override preset values", and `undefined` is not an explicit value. PR #540 fixed the same class of bug for pino's `messageKey`; this is the config-level twin.

Two smaller items live in the same function and file. Four merge blocks in `mergeConfig` merge keys no preset defines, so they only re-spread `override`; they are dead and get deleted first. And `flushTimeoutMs` accepts any finite non-negative number, but `setTimeout` treats anything above 2^31-1 as 1 ms, so a very large value makes the shutdown flush give up after a millisecond and buffered adapter batches are lost. Plan 065 put that ceiling on adapter `timeout` (PR #526); `flushTimeoutMs` was missed.

## Current state

- `packages/logixlysia/src/config/resolve-options.ts` owns option validation and preset merging.
- `packages/logixlysia/src/output/shutdown.ts:21` does `setTimeout(() => timeout.resolve('timeout'), ms)` with the validated `flushTimeoutMs`. Do not edit it; the fix is validation.
- `packages/logixlysia/src/index.ts:257` has `const DEFAULT_FLUSH_TIMEOUT_MS = 5000`, and `:678-682` passes `options.config?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS` to `raceWithTimeout`. Do not edit it.

`resolve-options.ts:47-48`:

```ts
const isNonNegativeNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
```

`resolve-options.ts:156-173` (the validator to extend):

```ts
const validateOutput = (config: Options['config']): void => {
  if (
    config?.useTransportsOnly === true &&
    (config.transports?.length ?? 0) === 0
  ) {
    invalidOutput(
      'useTransportsOnly is set but transports is empty; add a transport or remove useTransportsOnly'
    )
  }

  const flushTimeoutMs = config?.flushTimeoutMs
  if (flushTimeoutMs !== undefined && !isNonNegativeNumber(flushTimeoutMs)) {
    invalidOutput(
      `flushTimeoutMs must be a finite number of milliseconds at or above 0, got ${flushTimeoutMs}`
    )
  }
}
```

`resolve-options.ts:197-225` (`PRESET_DEFAULTS`): the three presets define only `pino`, `showContextTree`, `showStartupMessage`, `startupMessageFormat`, `useColors`, `autoRedact` and `requestId`. None defines `logFilter`, `sampling`, `logRotation` or `timestamp`.

`resolve-options.ts:227-279` (`mergeConfig`):

```ts
const mergeConfig = (
  base: NonNullable<Options['config']>,
  override?: Options['config']
): NonNullable<Options['config']> => {
  if (!override) {
    return base
  }

  const merged: NonNullable<Options['config']> = { ...base, ...override }

  if (base.pino || override.pino) {
    merged.pino = {
      ...base.pino,
      ...override.pino,
      ...(base.pino?.prettyPrint !== undefined ||
      override.pino?.prettyPrint !== undefined
        ? {
            prettyPrint: override.pino?.prettyPrint ?? base.pino?.prettyPrint
          }
        : {})
    }
  }

  if (base.logFilter || override.logFilter) {
    merged.logFilter = {
      ...base.logFilter,
      ...override.logFilter
    }
  }

  if (base.sampling || override.sampling) {
    merged.sampling = {
      ...base.sampling,
      ...override.sampling
    }
  }

  if (base.logRotation || override.logRotation) {
    merged.logRotation = {
      ...base.logRotation,
      ...override.logRotation
    }
  }

  if (base.timestamp || override.timestamp) {
    merged.timestamp = {
      ...base.timestamp,
      ...override.timestamp
    }
  }

  return merged
}
```

Only the `pino` block is live. The other four spread an always-undefined `base.<key>` with `override.<key>`, which `{ ...base, ...override }` already copied.

`resolve-options.ts:281-292` (`resolveOptions`) calls `mergeConfig(PRESET_DEFAULTS[preset], options.config)` only when a preset is set, then runs the validators.

Test exemplar, `packages/logixlysia/__tests__/config/resolve-options.test.ts:13-24`:

```ts
test('explicit config overrides preset', () => {
  const resolved = resolveOptions({
    config: {
      autoRedact: false,
      showStartupMessage: true
    },
    preset: 'prod'
  })

  expect(resolved.config?.autoRedact).toBe(false)
  expect(resolved.config?.showStartupMessage).toBe(true)
})
```

and `:235-243` tests `flushTimeoutMs` rejections (`POSITIVE_INFINITY`, `NaN`, `-1`) with `.toThrow('flushTimeoutMs')`.

The adapter precedent for the ceiling: `packages/logixlysia/src/adapters/shared.ts:24` has `const MAX_TIMER_DELAY_MS = 2_147_483_647` (private to that module; do not import it, define the same constant locally). Its test is `__tests__/adapters/shared.test.ts:1229`.

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

- `packages/logixlysia/src/config/resolve-options.ts`
- `packages/logixlysia/__tests__/config/resolve-options.test.ts`
- `.changeset/preset-undefined-and-flush-timeout.md` (create)

**Out of scope** (do not touch):

- `packages/logixlysia/src/output/shutdown.ts` and `src/index.ts`: the ceiling belongs in validation, as plan 065 did for adapters.
- `packages/logixlysia/src/adapters/shared.ts`: another plan owns it this round.
- `packages/logixlysia/src/logger/index.ts` (pino key handling from #540): already correct.
- Any docs under `apps/docs`.

## Steps

### Step 1: Delete the four dead merge blocks

In `mergeConfig`, delete the `logFilter`, `sampling`, `logRotation` and `timestamp` blocks (`resolve-options.ts:250-276`). Keep the `pino` block unchanged. The function becomes: early return, `merged = { ...base, ...override }`, the `pino` block, `return merged`.

**Verify**: `cd packages/logixlysia && bun test __tests__/config` → `0 fail`. `grep -c "merged\.\(logFilter\|sampling\|logRotation\|timestamp\)" src/config/resolve-options.ts` → `0`.

Commit: `refactor(config): drop preset merges for keys no preset defines`.

### Step 2: Ignore `undefined` override keys

Make `mergeConfig` spread only the override entries whose value is not `undefined`:

```ts
const defined = Object.fromEntries(
  Object.entries(override).filter(([, value]) => value !== undefined)
) as NonNullable<Options['config']>
const merged: NonNullable<Options['config']> = { ...base, ...defined }
```

Then use `defined.pino` in place of `override.pino` inside the `pino` block? No. Leave the `pino` block reading `override.pino`; it already handles an undefined `prettyPrint`. Only the top-level spread changes.

Add tests in `__tests__/config/resolve-options.test.ts` next to "explicit config overrides preset":

- `preset: 'prod'` with `config: { autoRedact: undefined, requestId: undefined }` → `resolved.config?.autoRedact` is `true` and `resolved.config?.requestId` is `true`.
- `preset: 'dev'` with `config: { logFilePath: undefined }` → `'logFilePath' in (resolved.config ?? {})` is `false` (a key no preset defines does not appear as an own key either). If `in` is awkward with the types, assert `Object.keys(resolved.config ?? {})` does not contain `'logFilePath'`.
- Without a preset, `resolveOptions({ config: { autoRedact: undefined } })` returns the config as given (`resolved.config?.autoRedact` is `undefined`). This pins that the filter only runs on the preset path.

**Verify**: `cd packages/logixlysia && bun test __tests__/config` → `0 fail`, three more tests than before.

Commit: `fix(config): keep preset values when a config key is explicitly undefined`.

### Step 3: Give `flushTimeoutMs` the timer ceiling

In `resolve-options.ts`, add near `isNonNegativeNumber`:

```ts
/** The largest delay `setTimeout` honours; above it the timer fires after 1 ms. */
const MAX_TIMER_DELAY_MS = 2_147_483_647
```

Change the `flushTimeoutMs` check in `validateOutput` to reject values above `MAX_TIMER_DELAY_MS` as well, with the message `flushTimeoutMs must be a finite number of milliseconds between 0 and 2147483647, got ${flushTimeoutMs}`.

Update the existing rejection test's expectations only if its `.toThrow('flushTimeoutMs')` substring stops matching (it should still match). Add:

- `flushTimeoutMs: 2_147_483_647` resolves without throwing and keeps the value.
- `flushTimeoutMs: 2_147_483_648` throws with a message containing `flushTimeoutMs`.
- `flushTimeoutMs: Number.MAX_SAFE_INTEGER` throws.

**Verify**: `cd packages/logixlysia && bun test __tests__/config` → `0 fail`.

Commit: `fix(config): reject a flushTimeoutMs the shutdown timer cannot honour`.

### Step 4: Changeset, full gates

Create `.changeset/preset-undefined-and-flush-timeout.md` (`'logixlysia': patch`) saying that a `preset` value is no longer lost when the same `config` key is set to `undefined`, and that `flushTimeoutMs` above 2147483647 is now rejected at startup instead of making the shutdown flush give up after a millisecond. Amend it into the Step 3 commit or commit as `chore: add changeset for preset merge and flushTimeoutMs ceiling`.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`. `git status --short` shows only the three in-scope paths (and nothing under `AGENTS.md`; revert turbo's block if it appeared).

## Test plan

New tests in `__tests__/config/resolve-options.test.ts` (listed in steps 2 and 3): three for the undefined-key merge, three for the ceiling. Model them after the existing `resolveOptions` tests in that file. All assertions are on `resolveOptions`'s return value or thrown error, which is what the plugin and `createLogger` observe.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 729 tests
- [ ] `grep -c "merged\.\(logFilter\|sampling\|logRotation\|timestamp\)" packages/logixlysia/src/config/resolve-options.ts` → `0`
- [ ] `grep -c "2_147_483_647" packages/logixlysia/src/config/resolve-options.ts` → `1`
- [ ] `git diff --stat 5115bea..HEAD` lists only the three in-scope paths
- [ ] Three commits (or four with the changeset), none with an attribution trailer

## STOP conditions

- The excerpts above do not match the live file.
- Deleting the four blocks makes any existing test fail (that would mean a preset does define one of those keys; re-read `PRESET_DEFAULTS`).
- The typed spread in Step 2 needs a cast beyond `as NonNullable<Options['config']>` or a lint disable to compile.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a preset ever defines `logFilter`, `sampling`, `logRotation` or `timestamp`, a nested merge for that key must come back; the top-level spread would otherwise replace the whole object.
- `MAX_TIMER_DELAY_MS` now exists in two modules (`adapters/shared.ts` and `config/resolve-options.ts`). A follow-up may move it to `utils/duration.ts`; this plan does not, because another plan edits `shared.ts` this round.
- Reviewer: check that the `pino` block still reads `override.pino`, so `pino: { prettyPrint: undefined }` under `preset: 'dev'` still keeps `prettyPrint: true`.
