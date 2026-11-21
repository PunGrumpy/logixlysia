# Plan 141: `timestamp.translateTime` formats pretty pino lines the way it formats the console line

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/logger/index.ts packages/logixlysia/src/logger/create-logger.ts packages/logixlysia/src/types/config.ts packages/logixlysia/__tests__/logger/create-logger.test.ts apps/docs/content/configuration.mdx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`config.timestamp.translateTime` is documented as a token pattern (`yyyy`, `mm`, `dd`, `HH`, `MM`, `ss`, `SSS`) that is rendered in local time unless it starts with `UTC:`. The console line follows that. The same string is also handed, unchanged, to pino-pretty for the lines written through `store.pino` when `pino.prettyPrint` is on (which `preset: 'dev'` turns on). pino-pretty reads the string by different rules: `S` is the ordinal suffix of the day, a pattern without a prefix is rendered in UTC, any other letter is a token, and `UTC:standard` is not a known name. So two lines of one request disagree, and one of them is garbage.

Measured at `c019a4f` with a fixed instant of 2026-01-02 03:04:05.678 UTC in a +07:00 zone:

| `timestamp.translateTime`     | console line              | `store.pino` pretty line today     |
| ----------------------------- | ------------------------- | ---------------------------------- |
| `HH:MM:ss.SSS`                | `10:04:05.678`            | `[03:04:05.ndndnd]`                |
| `yyyy-mm-dd HH:MM:ss`         | `2026-01-02 10:04:05`     | `[2026-01-02 03:04:05]`            |
| `yyyy-mm-ddTHH:MM:ss`         | `2026-01-02T10:04:05`     | `[2026-01-02A03:04:05]`            |
| `UTC:yyyy-mm-dd HH:MM:ss.SSS` | `2026-01-02 03:04:05.678` | `[2026-01-02 03:04:05.ndndnd]`     |
| `UTC:standard`                | `2026-01-02 03:04:05.678` | `[5aan2ar2]`                       |
| `SYS:standard`                | `2026-01-02 10:04:05.678` | `[2026-01-02 10:04:05.678 +0700]`  |

After this plan, the pretty pino line shows the same clock reading as the console line for every documented form. Only `SYS:standard` was right before, and it does not change.

## Current state

All source paths are relative to `packages/logixlysia/`.

`src/logger/index.ts` lines 76 to 82, inside `createLazyPino`, build the pino-pretty stream:

```ts
const prettyStream = (): ReturnType<typeof pretty> =>
  loadPretty()({
    colorize: stdoutWantsColor(),
    translateTime: config?.timestamp?.translateTime,
    ...prettyPrintOptions,
    ...outputKeys
  } as Record<string, unknown>)
```

`prettyPrintOptions` is the object a user passes as `config.pino.prettyPrint`. It is spread after `translateTime`, so a `translateTime` the user puts inside `pino.prettyPrint` wins. That must stay true, and that value must stay untouched: it is written in pino-pretty's own syntax.

`src/logger/index.ts` line 19 already imports from the neighbouring module: `import { createFormatContext } from './create-logger'`.

`src/logger/create-logger.ts` lines 92 to 122 hold the console side's reading of the pattern:

```ts
// pino-pretty's `standard` expands to `yyyy-mm-dd HH:MM:ss.l o`; this
// formatter has no `l` or `o` token, so it uses `SSS` and drops the offset.
const STANDARD_TIMESTAMP_PATTERN = 'yyyy-mm-dd HH:MM:ss.SSS'
const TIMESTAMP_PREFIX_LENGTH = 'sys:'.length
const TTY_TIMESTAMP_PATTERN = 'HH:MM:ss.SSS'
```

```ts
const resolveTimestampPattern = (
  pattern: string
): { pattern: string; utc: boolean } => {
  const prefix = pattern.slice(0, TIMESTAMP_PREFIX_LENGTH).toLowerCase()
  const utc = prefix === 'utc:'
  const rest =
    utc || prefix === 'sys:' ? pattern.slice(TIMESTAMP_PREFIX_LENGTH) : pattern
  return {
    pattern: rest === 'standard' ? STANDARD_TIMESTAMP_PATTERN : rest,
    utc
  }
}
```

`formatTimestamp` (lines 124 to 147) then replaces the seven tokens `yyyy`, `mm`, `dd`, `HH`, `MM`, `ss`, `SSS` and leaves every other character as it is.

pino-pretty 13.2.0 (`node_modules/pino-pretty/lib/utils/format-time.js`) hands the string to the `dateformat` package. The rules that matter:

- `SYS:<mask>` renders `<mask>` in local time, `UTC:<mask>` renders it in UTC, and a mask with no prefix is rendered in UTC.
- `SYS:standard` (any case) is the one named form: `yyyy-mm-dd HH:MM:ss.l o`, where `o` is the zone offset.
- In a mask, `yyyy`, `mm`, `dd`, `HH`, `MM` and `ss` mean what they mean here. Milliseconds are `l`. These are also tokens and would be replaced: `d`, `D`, `m`, `y`, `H`, `h`, `M`, `s`, `T`, `t`, `W`, `L`, `l`, `o`, `p`, `S`, `Z`, `N`. Text inside single quotes or inside double quotes is copied as written, without the quotes.

`__tests__/logger/create-logger.test.ts` lines 423 to 452 hold the one existing test of the forwarding. It captures the options given to a fake pino-pretty and expects the string unchanged:

```ts
expect(prettyOptionsCaptured).toMatchObject({
  colorize: true,
  translateTime: 'yyyy-mm-dd HH:MM:ss'
})
```

`src/types/config.ts` lines 222 to 230 document the option:

```ts
timestamp?: {
  /**
   * A `yyyy`/`mm`/`dd`/`HH`/`MM`/`ss`/`SSS` token pattern, e.g.
   * `'yyyy-mm-dd HH:MM:ss'`, rendered with local time. Also accepts
   * pino-pretty's prefixed forms: `'SYS:standard'` or `'SYS:<pattern>'`
   * for local time, and `'UTC:standard'` or `'UTC:<pattern>'` for UTC.
   * `standard` expands to `yyyy-mm-dd HH:MM:ss.SSS`.
   */
  translateTime?: string
}
```

`apps/docs/content/configuration.mdx` lines 169 to 193 list the three accepted forms (a bare pattern, `SYS:`, `UTC:`), each with a code sample. The list ends with the `UTC:yyyy-mm-dd HH:MM:ss` sample.

Conventions to match:

- Functions are `const` arrow functions with explicit parameter and return types. Regular expressions are top-level constants with the `u` flag, as in `const SRC_PREFIX = /^src\//u`.
- Comments say why, never what. Do not add comments that restate the code.
- Tests use `bun:test`, call the code the way a user does, and assert literal expected values.
- `bun test` runs in UTC unless `TZ` is set, and a test may change the zone at run time by assigning `process.env.TZ` (checked on Bun 1.3.14: after `process.env.TZ = 'Asia/Bangkok'`, `new Date(Date.UTC(2026, 0, 2, 3, 4, 5)).getHours()` is `10`).

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose        | Command                                                                        | Expected on success                              |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| Install        | `bun install --frozen-lockfile` (root)                                         | exit 0                                           |
| Build          | `cd packages/logixlysia && bun run build`                                      | `Build completed`                                |
| Lint           | `bun run lint` (root)                                                          | exit 0                                           |
| Format         | `bun run format` (root)                                                        | exit 0; read the diff it makes                   |
| Typecheck      | `cd packages/logixlysia && bun run typecheck`                                  | exit 0                                           |
| One test file  | `cd packages/logixlysia && bun test ./__tests__/logger/pino-pretty-timestamp.test.ts` | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite     | `cd packages/logixlysia && bun test`                                           | 0 fail                                           |
| Docs typecheck | `cd apps/docs && bun run typecheck`                                            | exit 0                                           |

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/logger/create-logger.ts`
- `packages/logixlysia/src/logger/index.ts`
- `packages/logixlysia/src/types/config.ts` (the doc comment of `translateTime` only)
- `packages/logixlysia/__tests__/logger/pino-pretty-timestamp.test.ts` (create)
- `packages/logixlysia/__tests__/logger/create-logger.test.ts` (one expected value)
- `apps/docs/content/configuration.mdx` (the `timestamp` section only)
- `.changeset/pretty-pino-timestamp.md` (create)

**Out of scope** (do NOT touch):

- `formatTimestamp` and what the console line prints. The console line is right and must not change.
- A `translateTime` the user passes inside `config.pino.prettyPrint`. It stays in pino-pretty's syntax and still wins.
- What pino-pretty prints when `config.timestamp.translateTime` is not set. Do not add a default.
- `apps/docs/content/integrations/pino.mdx` and every other docs page. Another pull request is editing them.
- Any new option, export from the package, or dependency.

## Git workflow

- Branch: `fix/pretty-pino-timestamp`, cut from the base commit your task names.
- Three commits, in this order:
  1. `fix(pino): format pretty lines with timestamp.translateTime the way the console line does` (the two source files, the type comment and both test files)
  2. `docs(configuration): say translateTime also formats pretty pino lines`
  3. `chore(changeset): note the pretty pino timestamp fix`
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing test

Create `packages/logixlysia/__tests__/logger/pino-pretty-timestamp.test.ts`. It writes one line through the real pino and the real pino-pretty into a memory stream, at a fixed instant, in a fixed zone, and reads the bracketed time at the start of the line. Use this harness:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Writable } from 'node:stream'
import { createLogger } from '../../src/logger'

const INSTANT = Date.UTC(2026, 0, 2, 3, 4, 5, 678)
const ZONE = 'Asia/Bangkok'
const TIME_PREFIX = /^\[(?<time>[^\]]*)\]/u

const prettyTime = (
  translateTime: string,
  prettyPrint: Record<string, unknown> = {}
): string => {
  let text = ''
  const destination = new Writable({
    write(chunk, _encoding, done) {
      text += chunk.toString()
      done()
    }
  })
  const logger = createLogger({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      pino: {
        prettyPrint: { colorize: false, destination, sync: true, ...prettyPrint },
        timestamp: () => `,"time":${INSTANT}`
      },
      timestamp: { translateTime }
    }
  })
  logger.pino.info('hi')
  return TIME_PREFIX.exec(text)?.groups?.time ?? text
}
```

Set the zone for the file and put it back afterwards:

```ts
const zoneBefore = process.env.TZ

beforeAll(() => {
  process.env.TZ = ZONE
})

afterAll(() => {
  if (zoneBefore === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = zoneBefore
  }
})
```

If the linter rejects `delete process.env.TZ`, use `Reflect.deleteProperty(process.env, 'TZ')`.

Tests, inside `describe('timestamp.translateTime on pretty pino lines', …)`. Each asserts a literal:

| Test name                                                        | Call                                                              | Expected                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| `the zone switch took effect`                                    | `new Date(INSTANT).getHours()`                                    | `10`                             |
| `a bare pattern is local time with milliseconds`                 | `prettyTime('HH:MM:ss.SSS')`                                      | `'10:04:05.678'`                 |
| `a bare date pattern is local time`                              | `prettyTime('yyyy-mm-dd HH:MM:ss')`                               | `'2026-01-02 10:04:05'`          |
| `letters between tokens are printed as written`                  | `prettyTime('yyyy-mm-ddTHH:MM:ss')`                               | `'2026-01-02T10:04:05'`          |
| `a word between tokens is printed as written`                    | `prettyTime('dd/mm/yyyy at HH:MM')`                               | `'02/01/2026 at 10:04'`          |
| `a UTC pattern is UTC with milliseconds`                         | `prettyTime('UTC:yyyy-mm-dd HH:MM:ss.SSS')`                       | `'2026-01-02 03:04:05.678'`      |
| `a SYS pattern is local time`                                    | `prettyTime('SYS:HH:MM:ss.SSS')`                                  | `'10:04:05.678'`                 |
| `SYS:standard keeps pino-pretty's standard form`                 | `prettyTime('SYS:standard')`                                      | `'2026-01-02 10:04:05.678 +0700'` |
| `UTC:standard is the standard form in UTC`                       | `prettyTime('UTC:standard')`                                      | `'2026-01-02 03:04:05.678 +0000'` |
| `a translateTime inside pino.prettyPrint wins and is not rewritten` | `prettyTime('yyyy', { translateTime: 'UTC:HH:MM:ss.l' })`      | `'03:04:05.678'`                 |

**Verify**: `cd packages/logixlysia && bun test ./__tests__/logger/pino-pretty-timestamp.test.ts` reports 3 pass and 7 fail. The three that pass before the fix are `the zone switch took effect`, `SYS:standard keeps pino-pretty's standard form` and `a translateTime inside pino.prettyPrint wins and is not rewritten`. Among the failures you should see `Received: "03:04:05.ndndnd"` for the first bare pattern. If `the zone switch took effect` fails, STOP. Keep the failing output for your report.

### Step 2: Translate the pattern before it reaches pino-pretty

In `src/logger/create-logger.ts`, directly after `resolveTimestampPattern`, add an exported function that turns a logixlysia pattern into the pino-pretty string with the same meaning. Target shape:

```ts
const TIMESTAMP_TOKEN = /yyyy|mm|dd|HH|MM|ss|SSS/gu
const NEEDS_QUOTING = /[A-Za-z"]/u
const PRETTY_STANDARD = 'yyyy-mm-dd HH:MM:ss.l o'

// pino-pretty reads every letter outside quotes as a token, so text between
// tokens is quoted. A single quote can only be written inside double quotes.
const quotePrettyLiteral = (literal: string): string =>
  literal
    .split("'")
    .map(part => (NEEDS_QUOTING.test(part) ? `'${part}'` : part))
    .join(`"'"`)

export const toPinoPrettyTranslateTime = (pattern: string): string => {
  const prefix = pattern.slice(0, TIMESTAMP_PREFIX_LENGTH).toLowerCase()
  const utc = prefix === 'utc:'
  const rest =
    utc || prefix === 'sys:' ? pattern.slice(TIMESTAMP_PREFIX_LENGTH) : pattern
  const zone = utc ? 'UTC:' : 'SYS:'
  if (rest === 'standard') {
    return `${zone}${PRETTY_STANDARD}`
  }

  let mask = ''
  let end = 0
  for (const match of rest.matchAll(TIMESTAMP_TOKEN)) {
    mask += quotePrettyLiteral(rest.slice(end, match.index))
    mask += match[0] === 'SSS' ? 'l' : match[0]
    end = match.index + match[0].length
  }
  return `${zone}${mask}${quotePrettyLiteral(rest.slice(end))}`
}
```

You may share the prefix parsing with `resolveTimestampPattern` if that reads better, as long as `resolveTimestampPattern` returns what it returns today. `SYS:` followed by `PRETTY_STANDARD` prints exactly what pino-pretty prints for `SYS:standard`, which the test in Step 1 pins.

In `src/logger/index.ts`, import the function from `./create-logger` (extend the existing import on line 19) and change the one line in `prettyStream`:

```ts
const prettyStream = (): ReturnType<typeof pretty> => {
  const translateTime = config?.timestamp?.translateTime
  return loadPretty()({
    colorize: stdoutWantsColor(),
    translateTime: translateTime
      ? toPinoPrettyTranslateTime(translateTime)
      : translateTime,
    ...prettyPrintOptions,
    ...outputKeys
  } as Record<string, unknown>)
}
```

An unset or empty `translateTime` is forwarded as it is today.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/logger/pino-pretty-timestamp.test.ts` reports 10 pass and 0 fail.

### Step 3: Update the one existing expectation

In `__tests__/logger/create-logger.test.ts`, the test `prettyPrint merges with default translateTime from config` expects the options given to pino-pretty. Change only the expected string, from `'yyyy-mm-dd HH:MM:ss'` to `'SYS:yyyy-mm-dd HH:MM:ss'`. Leave the config the test passes as it is.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/logger/create-logger.test.ts` reports 0 fail.

### Step 4: Say it in the type comment and the docs page

In `src/types/config.ts`, add one sentence to the end of the `translateTime` doc comment: the same pattern formats the time on `store.pino` lines when `pino.prettyPrint` is on, and a `translateTime` inside `pino.prettyPrint` is passed to pino-pretty as written.

In `apps/docs/content/configuration.mdx`, after the list of three forms in the `timestamp` section (after the `UTC:yyyy-mm-dd HH:MM:ss` code sample), add one short paragraph that says the same two things in the page's voice. State only what the tests in Step 1 show. Do not add a code sample.

**Verify**: `bun run lint` exits 0 (run `bun run format` first and read its diff), `cd packages/logixlysia && bun run typecheck` exits 0, `cd apps/docs && bun run typecheck` exits 0.

### Step 5: Changeset, gates, commits

Create `.changeset/pretty-pino-timestamp.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

The paragraph says: with `pino.prettyPrint` on, lines written through `store.pino` now show `timestamp.translateTime` the way the console line does. Before, `SSS` printed as letters, a pattern without a prefix was rendered in UTC, letters between tokens were replaced, and `UTC:standard` printed nonsense. A `translateTime` inside `pino.prettyPrint` is unchanged. Write it in your own plain words.

**Verify**: `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail. Make the three commits from "Git workflow", staging files by name. `git status --porcelain` is empty afterwards.

## Test plan

- New file `__tests__/logger/pino-pretty-timestamp.test.ts` with the ten tests in Step 1. Seven fail before Step 2 and all pass after it.
- One changed expectation in `__tests__/logger/create-logger.test.ts`.
- No test asserts on `toPinoPrettyTranslateTime` directly. The tests read the line pino-pretty writes.

## Done criteria

ALL must hold:

- [ ] `cd packages/logixlysia && bun test ./__tests__/logger/pino-pretty-timestamp.test.ts` reports 10 pass, 0 fail
- [ ] Your report quotes the Step 1 run, made before any source change, with its 7 failures
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the seven in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/logger/create-logger.ts` shows no change inside `formatTimestamp` or `resolveTimestampPattern`'s return values
- [ ] The API snapshot is unchanged: `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code.
- `the zone switch took effect` fails: the test cannot fix its zone and the plan's proof does not work.
- A Step 1 test that this plan says fails before the fix passes before it, or one it says passes fails.
- After Step 2 a test still fails and the fix seems to need a change to `formatTimestamp`, to the console line, or to a file out of scope.
- The API snapshot test fails. The new function must not become a package export.

## Maintenance notes

- If a token is added to `formatTimestamp`, add it to `TIMESTAMP_TOKEN` with its pino-pretty equivalent, and add a row to the test table.
- The console's `standard` has no zone offset and pino-pretty's has one. This plan keeps both as they were, so the two lines still differ by the ` +0700` suffix under `SYS:standard`. Making them identical would change output users already see.
- A reviewer should check the quoting: text between tokens must reach pino-pretty inside quotes whenever it contains a letter, or pino-pretty replaces it.
