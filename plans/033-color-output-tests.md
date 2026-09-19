# Plan 033: Test the colorized console path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 5522d31..HEAD -- packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/__tests__/logger`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 032 edits `formatTimestamp`
> in the same file; that hunk is not in this plan's path and is not a conflict.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `5522d31`, 2026-09-19

## Why this matters

The colorized line is the default terminal output and the thing the package exists for, and it has zero test coverage: `shouldUseColors` requires `process.stdout.isTTY === true`, which is false under `bun test`, so every `useColors` branch in `create-logger.ts` (level chip, method colour, status colour, duration colour and the `⚡ slow` badge, service token, context-tree keys) is dead in the suite. The file sits at 79 % line coverage for that reason. A `chalk` API change or a wrong colour chain would ship green. These tests are also the prerequisite for ever replacing `chalk` with `util.styleText`.

## Current state

`create-logger.ts:27–34`:

```ts
const shouldUseColors = (options: Options): boolean => {
  const { config } = options
  const enabledByConfig = config?.useColors ?? true
  // Avoid ANSI sequences in non-interactive output (pipes, CI logs, files).
  const isTty = typeof process !== 'undefined' && process.stdout?.isTTY === true
  return enabledByConfig && isTty
}
```

`createFormatContext(options)` (line ≈277) computes `useColors` once per logger. Colour helpers (all `(value, useColors) => string`): `colorDurationText` (95–116: `< slow` green, `< verySlow` yellow, else `red.bold`), `getSpeedToken` (118–128: `chalk.yellow('⚡ slow')` when very slow), `getLevelIcon` (130–144: `chalk.bgRed.black(' 🦊 ')` for ERROR, `bgYellow` WARNING, `bgBlue` DEBUG, `bgGreen` INFO), `getColoredLevel` (146–162), `getColoredMethod` (164–199: GET `green.bold`, POST `blue.bold`, PUT `yellow.bold`, PATCH `yellowBright.bold`, DELETE `red.bold`, HEAD `cyan.bold`, OPTIONS `greenBright.bold`, CONNECT `magenta.bold`, TRACE `cyanBright.bold`, other `white.bold`), `getColoredStatus` (201–224: 5xx red, 4xx yellow, 3xx cyan, 2xx green, else gray), `getColoredTimestamp`, `getColoredPathname`, `getServiceToken`, and the context tree's `chalk.cyan(k)` (≈363).

`chalk` v6 decides its colour level at import time from `supports-color`; in CI or a non-TTY test run the level is 0 and every `chalk.x()` returns the input unchanged. `chalk.level` is writable (`import chalk from 'chalk'; chalk.level = 3`).

Existing test style: `__tests__/logger/format-output.test.ts` and `create-logger.test.ts` call `createLogger(options)` with `spyConsole` and inspect the console argument; `__tests__/_helpers/request.ts` has `createMockRequest(url, init?)`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `bun install --frozen-lockfile` | exit 0 |
| Lint / Format / Typecheck | `bun run lint` / `bun run format` / `bun run typecheck` | exit 0 |
| Targeted | `cd packages/logixlysia && bun test __tests__/logger/colors.test.ts` | all pass |
| Coverage line for the file | `cd packages/logixlysia && bun test 2>&1 \| grep create-logger.ts` | line % printed |

## Scope

**In scope**: `packages/logixlysia/__tests__/logger/colors.test.ts` (create). Nothing under `src/` unless a helper must be exported for direct testing; prefer driving through `createLogger` so no source change is needed.

**Out of scope**: `bunfig.toml` coverage threshold (raise it in a separate change once plan 032's rotation tests also land); replacing `chalk`.

## Git workflow

- Branch: `improve/033-color-output-tests` off `main`.
- One commit: `test(logger): cover the colorized console path`.
- No changeset (tests only).
- Do NOT push or open a PR.

## Steps

### Step 1: Force a colour-capable environment inside the test file only

At the top of `colors.test.ts`:

```ts
import chalk from 'chalk'
const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
const originalLevel = chalk.level
beforeAll(() => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })
  chalk.level = 3
})
afterAll(() => {
  chalk.level = originalLevel
  if (originalIsTTY) Object.defineProperty(process.stdout, 'isTTY', originalIsTTY)
  else delete (process.stdout as { isTTY?: boolean }).isTTY
})
```

Because `createFormatContext` reads `isTTY` when the logger is created, construct loggers inside each test (after `beforeAll`).

**Verify**: a first test `'emits ANSI when stdout is a TTY'` logs a 200 GET and asserts the console argument contains `\u001b[`.

### Step 2: Assert each colour decision

Add tests that log through `createLogger({ config: { disableFileLogging: true, useColors: true, ... } })` with `spyConsole` and assert on ANSI codes (chalk level 3 uses 16-colour SGR for named colours: green `\u001b[32m`, yellow `\u001b[33m`, red `\u001b[31m`, blue `\u001b[34m`, cyan `\u001b[36m`, bold `\u001b[1m`; backgrounds `\u001b[41m` red, `\u001b[43m` yellow, `\u001b[44m` blue, `\u001b[42m` green):

- method: GET contains `[32m` + `[1m` around `GET`; POST `[34m`; DELETE `[31m`
- status: 200 `[32m`, 404 `[33m`, 500 `[31m`, 301 `[36m`
- level chip: ERROR path (`handleHttpError` with a 500) contains `[41m` and `🦊`; a 404 contains `[43m`
- duration: with `slowThreshold: 1, verySlowThreshold: 2` and a `store.beforeTime` far in the past, the line contains `[31m` and `⚡ slow`; with generous thresholds it contains `[32m` and no badge
- context tree: `showContextTree: true` with `context: { userId: 'u1' }` → the tree line contains `[36m` around `userId`
- `useColors: false` with the TTY forced → no `\u001b[` at all

Use `String(spies.info.mock.calls[0][0])` (or `.warn`/`.error` per level) and `expect(output).toContain(...)`.

**Verify**: `bun test __tests__/logger/colors.test.ts` → all pass. Run the whole suite to prove the `afterAll` restores state (no other test starts emitting ANSI): `cd packages/logixlysia && bun test` → same pass count + new tests, and `format-output.test.ts` still passes.

### Step 3: Coverage check

**Verify**: `bun test 2>&1 | grep create-logger.ts` → line coverage ≥ 90 % (was 79.05 %). If it is lower, find the remaining uncovered ranges in the report and add a targeted case (e.g. `customLogFormat` with `{service}` and `config.service` set, `{ip}` with `ip: true` and an `x-forwarded-for` header).

## Done criteria

- [ ] `packages/logixlysia/__tests__/logger/colors.test.ts` exists with ≥ 10 tests
- [ ] `cd packages/logixlysia && bun test` exits 0
- [ ] `create-logger.ts` line coverage ≥ 90 %
- [ ] No file under `src/` modified (`git status`)
- [ ] `bun run lint`, `bun run typecheck` exit 0

## STOP conditions

- `process.stdout.isTTY` cannot be redefined under Bun (report the error) — fallback: report and propose a `forceColors` test-only option rather than adding it yourself.
- Setting `chalk.level` has no effect because the package resolves a different `chalk` instance than the one the test imports (check `bun pm ls chalk`).
- Other test files start failing after the suite because state leaked (the `afterAll` did not restore); fix the restore, do not loosen other tests.
