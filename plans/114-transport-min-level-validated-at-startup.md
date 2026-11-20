# Plan 114: A transport with an unknown `minLevel` is rejected when the plugin is created

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1e4f7cc..HEAD -- packages/logixlysia/src/config/resolve-options.ts packages/logixlysia/src/types/config.ts packages/logixlysia/__tests__/config/resolve-options.test.ts packages/logixlysia/__tests__/output/min-level.test.ts apps/docs/content/features/transports.mdx` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1e4f7cc`, 2026-11-20
- **Executed**: [PR #641](https://github.com/PunGrumpy/logixlysia/pull/641), merged as `e6a9be3`

## Why this matters

`minLevel` on a transport is documented as "the lowest level this transport receives". The built-in adapters and `createHttpTransport` check the value when they are created, but a transport a user writes by hand and puts in `config.transports` is never checked. A value that is not one of the four levels (`'error'`, `'WARN'`, anything from a JavaScript config or a cast) has rank `-1`, so no record is ever "below" it and the transport receives every level. The filter fails open with no warning: a paging or billing-by-volume destination that was meant to get only errors gets every `DEBUG` and `INFO` line.

After this plan, any `minLevel` in `config.transports` that is not `DEBUG`, `INFO`, `WARNING` or `ERROR` throws `logixlysia: invalid output config` when the plugin (or `createLogger`) is created, the same moment every other invalid option is reported.

## Current state

The published package lives in `packages/logixlysia` (Bun 1.3.14, TypeScript 6.0.3, tests with `bun:test`).

- `packages/logixlysia/src/output/index.ts` — hands each record to the transports. The gate (do NOT change this file):

  ```ts
  // packages/logixlysia/src/output/index.ts:45-48
  const isBelowMinLevel = (
    level: LogLevel,
    minLevel: LogLevel | undefined
  ): boolean => minLevel !== undefined && levelRank(level) < levelRank(minLevel)
  ```

- `packages/logixlysia/src/helpers/level.ts` — the level table (do NOT change this file):

  ```ts
  // packages/logixlysia/src/helpers/level.ts:4-14
  export const LOG_LEVELS: readonly LogLevel[] = [
    'DEBUG',
    'INFO',
    'WARNING',
    'ERROR'
  ]

  export const levelRank = (level: LogLevel): number =>
    LOG_LEVELS.indexOf(level)

  export const isLogLevel = (value: unknown): value is LogLevel =>
    typeof value === 'string' &&
    (LOG_LEVELS as readonly string[]).includes(value)
  ```

  `levelRank('error' as LogLevel)` is `-1`, and `levelRank(anyRealLevel) < -1` is always false. That is the bug.

- `packages/logixlysia/src/adapters/shared.ts:605-611` — the check the adapters already have (do NOT change this file; it shows the behaviour to match):

  ```ts
  const { minLevel } = input.options
  if (minLevel !== undefined && !LOG_LEVELS.includes(minLevel)) {
    throw transportError(
      input.name,
      `minLevel must be one of ${LOG_LEVELS.join(', ')}, got ${String(minLevel)}`
    )
  }
  ```

- `packages/logixlysia/src/config/resolve-options.ts` — validates every option at startup. This is the file to change. `isLogLevel` is already imported on line 1. The relevant parts today:

  ```ts
  // packages/logixlysia/src/config/resolve-options.ts:72-74
  const invalidOutput = (detail: string): never => {
    throw new Error(`logixlysia: invalid output config — ${detail}`)
  }
  ```

  ```ts
  // packages/logixlysia/src/config/resolve-options.ts:229-251
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
    if (
      flushTimeoutMs !== undefined &&
      !(
        isNonNegativeNumber(flushTimeoutMs) &&
        flushTimeoutMs <= MAX_TIMER_DELAY_MS
      )
    ) {
      invalidOutput(
        `flushTimeoutMs must be a finite number of milliseconds between 0 and ${MAX_TIMER_DELAY_MS}, got ${flushTimeoutMs}`
      )
    }
  }
  ```

  ```ts
  // packages/logixlysia/src/config/resolve-options.ts:402-408 (inside resolveOptions)
  validateLogRotation(resolved.config)
  validateSampling(resolved.config)
  validateFormatting(resolved.config)
  validateLogFilter(resolved.config)
  validateOutput(resolved.config)
  validateRequestId(resolved.config)
  return normalizeRedactPatterns(resolved)
  ```

  The convention in this file: one small `validateX` function per concern, a `never`-returning `invalidX(detail)` helper that throws `logixlysia: invalid X config — detail`, and unknown input read as `unknown` before it is checked (see `validateLogFilterLevel` at lines 165-176, which reports a bad level with "must be an array of DEBUG, INFO, WARNING or ERROR, got …").

- `packages/logixlysia/src/types/config.ts:26-30` — the public doc of the field:

  ```ts
  /**
   * The lowest level this transport receives; quieter records skip it and are
   * not counted as dropped. Leave it out to receive every level.
   */
  minLevel?: LogLevel
  ```

- `packages/logixlysia/__tests__/config/resolve-options.test.ts` — unit tests of `resolveOptions`. The neighbouring tests to model yours on (lines 407-424):

  ```ts
  test('throws on useTransportsOnly without a transport', () => {
    expect(() =>
      resolveOptions({ config: { useTransportsOnly: true } })
    ).toThrow('useTransportsOnly')
    expect(() =>
      resolveOptions({ config: { transports: [], useTransportsOnly: true } })
    ).toThrow('useTransportsOnly')
  })

  test('accepts useTransportsOnly with a transport', () => {
    const transports = [{ log: () => {} }]
    const resolved = resolveOptions({
      config: { transports, useTransportsOnly: true }
    })

    expect(resolved.config?.transports).toBe(transports)
    expect(resolved.config?.useTransportsOnly).toBe(true)
  })
  ```

- `packages/logixlysia/__tests__/output/min-level.test.ts` — behaviour tests of `minLevel` through the plugin. It already has these helpers (lines 15-49) and this adapter test (lines 96-103):

  ```ts
  const createCapture = (
    minLevel?: LogLevel
  ): { levels: LogLevel[] } & Transport => {
    const levels: LogLevel[] = []
    return {
      levels,
      log: level => {
        levels.push(level)
      },
      minLevel
    }
  }

  const createApp = (transports: Transport[]) =>
    new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports
          }
        })
      )
      .get('/ok', () => 'ok')
  // ...
  ```

  ```ts
  test('an adapter rejects a minLevel that is not a level', () => {
    expect(() =>
      createBetterStackTransport({
        minLevel: 'error' as never,
        sourceToken: 'x'
      })
    ).toThrow(/minLevel/u)
  })
  ```

- `apps/docs/content/features/transports.mdx:147` — the docs paragraph under `## Minimum Level`:

  > Set `minLevel` on a transport to send it only records at that level or louder. The levels, quietest first, are `DEBUG`, `INFO`, `WARNING` and `ERROR`. Records below it skip the transport and are not counted as dropped. A transport without `minLevel` receives every level.

Repo conventions that apply:

- Lint and format are Ultracite (oxlint + oxfmt). `bun run format` fixes most findings, including object-key order and Markdown formatting. No `any`; read untrusted values as `unknown` and narrow.
- No comments that narrate the code. A comment is for a non-obvious why only.
- Any change under `packages/logixlysia/` needs a changeset: `.changeset/<slug>.md` with `'logixlysia': patch|minor`. An example from this repository:

  ```md
  ---
  'logixlysia': patch
  ---

  Honor the `NO_COLOR` environment variable. When it is set to a non-empty value, the console line is printed without colors on an interactive terminal too, as it is with `useColors: false`, and the pino pretty stream stops colorizing.
  ```

## Commands you will need

Run from the root of your checkout unless a row says otherwise.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0 |
| Build the package | `bun run build --filter logixlysia` | exit 0 (the API-snapshot test reads `packages/logixlysia/dist`) |
| Lint + format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck (package and docs snippets) | `bun run typecheck` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/config/resolve-options.test.ts` | `0 fail` (the exit code is 1 for a subset: the coverage threshold applies to the whole suite; judge a subset by its pass and fail counts) |
| Full suite | `cd packages/logixlysia && bun test` | exit 0, `0 fail`; 1192 tests pass at `1e4f7cc` |

Notes that are facts about this repository:

- `turbo` (behind `bun run build` and `bun run typecheck`) can append an agent-guidance block to `AGENTS.md`. If `git status --short` ever shows `AGENTS.md` as modified, run `git checkout -- AGENTS.md`. Never commit `AGENTS.md`.
- One test, `an app bundled into one file > logs through pino-pretty with prettyPrint` (`__tests__/logger/bundled-app.test.ts`), spawns two subprocesses and has failed under heavy machine load. If it is the only failure, run `cd packages/logixlysia && bun test __tests__/logger/bundled-app.test.ts` once; if that passes, rerun the full suite and report both results.
- Never run `bun install` without `--frozen-lockfile`. Never commit `bun.lock`, `dist/`, `.turbo/`, `node_modules/` or anything under `plans/`.

## Scope

**In scope** (the only files you should modify or create):

- `packages/logixlysia/src/config/resolve-options.ts`
- `packages/logixlysia/src/types/config.ts` (the doc comment on `Transport.minLevel` only)
- `packages/logixlysia/__tests__/config/resolve-options.test.ts`
- `packages/logixlysia/__tests__/output/min-level.test.ts`
- `apps/docs/content/features/transports.mdx` (one sentence)
- `.changeset/transport-min-level-validated.md` (create)

**Out of scope** (do NOT touch, even though they look related):

- `packages/logixlysia/src/output/index.ts` and `packages/logixlysia/src/helpers/level.ts` — the gate and the level table stay as they are. The fix is to reject the value at startup, not to change how the gate treats an unknown level at request time.
- `packages/logixlysia/src/adapters/shared.ts` and `packages/logixlysia/src/desertant.ts` — adapters already validate; `withRedaction` forwards the wrapped transport's `minLevel`, which this plan validates when it reaches `config.transports`.
- `apps/docs/content/configuration.mdx`, `apps/docs/content/api-reference.mdx`, `apps/docs/content/faq.mdx` — another open pull request is editing them.
- `skills/logixlysia/SKILL.md`, `AGENTS.md`, `plans/**`.
- Any other validation in `resolve-options.ts`. Do not validate that `transports` is an array or that an entry has a `log` function; that is a different change.

## Git workflow

- Branch: `fix/transport-min-level-validation`, created from `origin/main` (the operator may already have created it for you; if you are on it, do not create another).
- Three commits, in this order, with these subjects (Conventional Commits, lower case after the colon, no trailing period):
  1. `fix(config): reject a transport minLevel that is not a level` — `resolve-options.ts`, `types/config.ts` and both test files.
  2. `docs(transports): say an unknown minLevel throws at startup` — `transports.mdx`.
  3. `chore(changeset): note the transport minLevel check` — the changeset file.
- Each commit message has the subject, a blank line, then one or two short paragraphs of plain prose wrapped at 72 columns that say what was wrong and what the change does. No bullet lists, no headings. An example from this repository's history:

  ```
  fix(status): read a status() result from either Elysia line

  Elysia 2 builds `status()` as an `ElysiaStatus` that carries its code
  in `status` and leaves `response` unset for a bodiless code, where 1.x
  builds an `ElysiaCustomStatusResponse` with `code`. The plugin matched
  only the 1.x class, so on 2.x a thrown or returned status() was logged
  as a non-Error object with the wrong level. Both shapes now read back
  as one code and body.
  ```

- Stage files by name (`git add <path> …`). Never `git add -A`, `git add .` or `git commit -a`.
- No `Co-Authored-By`, `Signed-off-by` or "Generated with" line. No mention of AI, assistants, agents or models anywhere: not in a commit message, a code comment, a test name, a docs page or the changeset.
- If `git commit` fails because commit signing is unavailable, retry that commit as `git -c commit.gpgsign=false commit …`. Never change git configuration.
- Do NOT push and do NOT open a pull request. The operator does both.

## Steps

### Step 1: Write the failing tests

In `packages/logixlysia/__tests__/config/resolve-options.test.ts`, inside `describe('resolveOptions', …)`, directly after the test named `accepts useTransportsOnly with a transport`, add two tests:

```ts
test('throws on a transport minLevel that is not a level', () => {
  const log = (): void => {}

  expect(() =>
    resolveOptions({
      config: { transports: [{ log }, { log, minLevel: 'error' as never }] }
    })
  ).toThrow('transports[1].minLevel must be DEBUG, INFO, WARNING or ERROR')
  expect(() =>
    resolveOptions({
      config: { transports: [{ log, minLevel: 'WARN' as never }] }
    })
  ).toThrow('logixlysia: invalid output config')
  expect(() =>
    resolveOptions({
      config: { transports: [{ log, minLevel: null as never }] }
    })
  ).toThrow('transports[0].minLevel')
})

test('accepts each level and an absent minLevel on a transport', () => {
  const log = (): void => {}
  const transports = [
    { log },
    { log, minLevel: undefined },
    { log, minLevel: 'DEBUG' as const },
    { log, minLevel: 'INFO' as const },
    { log, minLevel: 'WARNING' as const },
    { log, minLevel: 'ERROR' as const }
  ]

  expect(resolveOptions({ config: { transports } }).config?.transports).toBe(
    transports
  )
})
```

In `packages/logixlysia/__tests__/output/min-level.test.ts`, directly after the test named `an adapter rejects a minLevel that is not a level`, add one test that goes through the plugin, the way a user would hit it:

```ts
test('the plugin rejects a hand-written transport whose minLevel is not a level', () => {
  expect(() => createApp([createCapture('error' as never)])).toThrow(
    'transports[0].minLevel must be DEBUG, INFO, WARNING or ERROR, got error'
  )
})
```

Run `bun run format` so the new code matches the formatter (it may re-wrap lines; that is fine).

**Verify**: `cd packages/logixlysia && bun test __tests__/config/resolve-options.test.ts __tests__/output/min-level.test.ts` → exactly 2 tests fail: `throws on a transport minLevel that is not a level` and `the plugin rejects a hand-written transport whose minLevel is not a level`. `accepts each level and an absent minLevel on a transport` passes already. If the two do not fail, STOP: the bug this plan fixes is not there.

### Step 2: Validate `minLevel` in `resolveOptions`

In `packages/logixlysia/src/config/resolve-options.ts`, add a function directly above `validateOutput` and call it as the first statement of `validateOutput`. Target shape (the behaviour is load-bearing; adjust syntax only as lint requires):

```ts
const validateTransportLevels = (config: Options['config']): void => {
  const transports: unknown = config?.transports
  if (!Array.isArray(transports)) {
    return
  }
  for (const [index, transport] of transports.entries()) {
    const minLevel: unknown = (
      transport as { minLevel?: unknown } | null | undefined
    )?.minLevel
    if (minLevel !== undefined && !isLogLevel(minLevel)) {
      invalidOutput(
        `transports[${index}].minLevel must be DEBUG, INFO, WARNING or ERROR, got ${String(minLevel)}`
      )
    }
  }
}
```

Rules the implementation must keep:

- Only `undefined` and the four exact strings `DEBUG`, `INFO`, `WARNING`, `ERROR` pass. `null`, lower-case spellings, numbers and anything else throw.
- The message starts with `logixlysia: invalid output config — ` (that prefix comes from `invalidOutput`) and names the index.
- Use `String(minLevel)`, not `JSON.stringify`, so a BigInt or a symbol cannot make the error itself throw.
- A `transports` value that is not an array, and an entry that is `null` or not an object, are skipped without throwing. This plan adds one check, not three.
- `resolveOptions` stays idempotent: it returns the same `transports` array it was given.

Then update the doc comment in `packages/logixlysia/src/types/config.ts` (lines 26-30) to:

```ts
/**
 * The lowest level this transport receives; quieter records skip it and are
 * not counted as dropped. Leave it out to receive every level. Any other
 * value throws when the plugin is created.
 */
minLevel?: LogLevel
```

**Verify**:

- `cd packages/logixlysia && bun test __tests__/config/resolve-options.test.ts __tests__/output/min-level.test.ts` → `0 fail`.
- `bun run lint` → exit 0 (run `bun run format` first if it reports formatting).
- `bun run typecheck` → exit 0.

### Step 3: Commit the fix

Stage `packages/logixlysia/src/config/resolve-options.ts`, `packages/logixlysia/src/types/config.ts`, `packages/logixlysia/__tests__/config/resolve-options.test.ts` and `packages/logixlysia/__tests__/output/min-level.test.ts`, and commit with subject 1 from "Git workflow".

**Verify**: `git log -1 --format=%s` → `fix(config): reject a transport minLevel that is not a level`; `git show --stat --format= HEAD` lists exactly those four files.

### Step 4: Docs sentence

In `apps/docs/content/features/transports.mdx`, in the paragraph under `## Minimum Level` that starts with "Set `minLevel` on a transport", append this sentence at the end of the paragraph (same paragraph, after "A transport without `minLevel` receives every level."):

> Any other value, such as `'error'` or `'WARN'`, makes the plugin throw `logixlysia: invalid output config` when you construct it.

Run `bun run format`, then commit `apps/docs/content/features/transports.mdx` with subject 2.

**Verify**: `rg -n "invalid output config" apps/docs/content/features/transports.mdx` → one match; `bun run lint` → exit 0.

### Step 5: Changeset

Create `.changeset/transport-min-level-validated.md` with exactly:

```md
---
'logixlysia': patch
---

A transport you write yourself is now checked for a valid `minLevel` when the plugin is created. Before, only the built-in adapters and `createHttpTransport` checked it, so `{ log, minLevel: 'error' }` in `config.transports` was accepted and then received every level. A `minLevel` that is not `DEBUG`, `INFO`, `WARNING` or `ERROR` now throws `logixlysia: invalid output config`.
```

Run `bun run format`, then commit the file with subject 3.

**Verify**: `bun run lint` → exit 0; `git status --short` → empty.

### Step 6: Full gates

**Verify**:

- `bun run build --filter logixlysia` → exit 0, then `git status --short` → empty (restore `AGENTS.md` with `git checkout -- AGENTS.md` if turbo touched it).
- `bun run lint` → exit 0.
- `bun run typecheck` → exit 0.
- `cd packages/logixlysia && bun test` → exit 0, `0 fail`, 1195 pass (1192 before, plus the 3 new tests).

## Test plan

- `__tests__/config/resolve-options.test.ts`: `throws on a transport minLevel that is not a level` (lower-case spelling at index 1, `'WARN'`, `null`; asserts the index and the `invalid output config` prefix) and `accepts each level and an absent minLevel on a transport` (the four levels, an explicit `undefined`, no key; asserts the same array comes back).
- `__tests__/output/min-level.test.ts`: `the plugin rejects a hand-written transport whose minLevel is not a level`, through `logixlysia()` as a user would hit it, asserting the full message including the offending value.
- Pattern: the neighbouring `useTransportsOnly` tests in `resolve-options.test.ts` and the adapter test in `min-level.test.ts`, both quoted in "Current state".
- Verification: `cd packages/logixlysia && bun test` → 1195 pass, 0 fail.

## Done criteria

ALL must hold:

- [ ] `bun run lint` exits 0
- [ ] `bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` exits 0 with `0 fail` and 1195 passing tests
- [ ] `rg -n "validateTransportLevels" packages/logixlysia/src/config/resolve-options.ts` returns two matches (the definition and the call)
- [ ] `git diff --name-only origin/main...HEAD` lists exactly the six in-scope files
- [ ] `git log --format=%s origin/main..HEAD` shows the three subjects from "Git workflow", newest first
- [ ] `git log --format=%B origin/main..HEAD | rg -i "co-authored|signed-off|generated with"` returns nothing
- [ ] `plans/README.md` status row updated (skip if a reviewer dispatched you)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts.
- In Step 1 the two tests that should fail already pass.
- An existing test fails after Step 2 because it passes a `minLevel` that is not a level through `logixlysia()` or `resolveOptions()` on purpose. Report the test name and file; do not edit it.
- Lint cannot be satisfied without changing the behaviour listed under "Rules the implementation must keep".
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- The level list is spelled out in the error message, as `validateLogFilterLevel` does. If a fifth level is ever added to `LOG_LEVELS`, both messages need it.
- `logToTransports` still treats an unknown `minLevel` as "receive everything" at request time. That path is now unreachable through the plugin or `createLogger`; it remains reachable only by calling `logToTransports` directly, which is internal.
- A reviewer should check that nothing else in `validateOutput` changed and that a `null` entry in `transports` does not start throwing.
- Deferred on purpose: validating that `transports` is an array of objects with a `log` function.
