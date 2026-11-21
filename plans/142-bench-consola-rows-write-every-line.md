# Plan 142: The benchmark's consola rows write every line, and the comparison page names the suites that exist

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/bench apps/docs/content/comparison.mdx`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`packages/bench/index.bench.ts` compares six loggers by calling each one in a tight loop with the same arguments and counting on every call reaching a shared sink. consola, by default, treats a message repeated within one second as a duplicate: after five repeats it stops writing and only counts. So in the three plain-log suites the consola row times consola's duplicate check, not logging. A burst of 1000 identical calls reaches the sink 5 times for consola and 1000 times for each of the other five. In nine interleaved rounds of 50000 calls, consola as benched took a median of 1144 ns per call and wrote nothing, and with the duplicate check off it took 300 ns and wrote every line. The row makes consola look about four times slower than it is, and anyone who runs `bun run bench` reads that row.

The harness has a start-up check meant to catch a library that does not write, but it makes one call, and the first call always gets through.

Separately, the comparison page of the docs describes three request suites, one of them an "overhead floor" with "all sinks disabled". No such suite exists since the harness was reworked. There are four request suites, and the floor is plain Elysia with no plugin.

After this plan, the consola rows write a line per call, the start-up check would catch any library that drops repeats, and the page describes the suites that are in the file.

## Current state

`packages/bench/index.bench.ts`, lines 102 to 129, the sink and the start-up check:

```ts
let linesWritten = 0
let onLine: ((value: null) => void) | undefined

// Every library below writes into this one sink. Each case is timed until the
// sink has received its line, so work a library defers to a hook that runs
// after the response (two of the plugins below do) is inside the timed region.
const sink = (): void => {
  linesWritten += 1
  onLine?.(null)
}

const expectOneLine = async (
  label: string,
  run: () => unknown
): Promise<void> => {
  const before = linesWritten
  await run()
  await tick()
  const written = linesWritten - before
  if (written !== 1) {
    throw new Error(`${label}: expected 1 log line, got ${written}`)
  }
}

const plainCase = async (label: string, fn: () => void): Promise<Case> => {
  await expectOneLine(label, fn)
  return [label, fn]
}
```

`requestCase` (lines 135 to 149) also calls `expectOneLine(label, send)`, with one request. It stays as it is: each request case already waits for its own line inside the timed function.

Lines 159 to 160, the consola instance:

```ts
// Under vitest consola defaults to a level that drops info, so set it.
const c = consola.create({ level: 3, reporters: [{ log: sink }] })
```

`plainCase` is used 18 times, in the suites `Simple Log (String)`, `Structured Log (Object)` and `Deep Nested Log`, six loggers each: `logixlysia`, `pino`, `consola`, `winston`, `evlog`, `bogeychan`.

consola 3.4.2 (`node_modules/consola/dist/core.mjs`) has the options `throttle: 1000` (milliseconds) and `throttleMin: 5`. A call that arrives less than `throttle` ms after the previous one and has the same type, tag and arguments is counted, and past `throttleMin` it is not written. With `throttle: 0` no call is ever "less than 0 ms" after the previous one, so every call is written.

The file starts with a `Logger Creation` suite (six loggers, each case creates one instance), then the three plain-log suites. The request suites in the file, in order:

1. `Elysia plugin request path (timed until the log line is written)`: `logixlysia`, `logixlysia (preset prod)`, `evlog`, `bogeychan`. Each is an Elysia app with that plugin writing into the shared sink, and each case is timed until the sink has the line.
2. `Elysia request path reference (no logger)`: `bare elysia`, an app with no plugin.
3. `Elysia plugin request path — structured sink`: logixlysia only, the `prod` and `json` presets writing to a transport that does nothing.
4. `Elysia plugin request path — file sink`: logixlysia only, writing to a file. The file write is not awaited.

`apps/docs/content/comparison.mdx`, line 47, is one paragraph:

```
The benchmark package has three request-path suites: an **overhead floor** (all sinks disabled — measures plugin dispatch cost only), a **structured sink** run (no-op transport/drain — measures log assembly and dispatch), and a **file sink** run. Compare like with like: the floor numbers contain no logging work by design. Results vary by machine — use them for regression tracking, not absolute rankings.
```

This page is the comparison page, so it may name other logging libraries. No other file in this plan may.

## Commands you will need

| Purpose          | Command                                                             | Expected on success                         |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Install          | `bun install --frozen-lockfile` (root)                              | exit 0                                      |
| Build the plugin | `cd packages/logixlysia && bun run build`                           | `Build completed` (the bench imports `dist`) |
| Run the bench    | `cd packages/bench && bun x vitest bench --run`                     | every suite runs; exit 0; about a minute    |
| Bench typecheck  | `cd packages/bench && bun run typecheck`                            | exit 0                                      |
| Lint             | `bun run lint` (root)                                               | exit 0                                      |
| Format           | `bun run format` (root)                                             | exit 0; read the diff it makes              |
| Docs typecheck   | `cd apps/docs && bun run typecheck`                                 | exit 0                                      |

The start-up checks run when the bench file is loaded, before any suite, so a failing check stops the whole run with its message. Do not quote the timings the bench prints: the machine is busy and they mean nothing here.

## Scope

**In scope** (the only files you may modify):

- `packages/bench/index.bench.ts`
- `apps/docs/content/comparison.mdx` (line 47 only)

**Out of scope** (do NOT touch):

- Anything under `packages/logixlysia/`. No changeset is needed: nothing in the published package changes.
- `.github/workflows/bench.yml`.
- The names of suites and cases. The bench workflow keys its baseline files on them.
- The request suites and `requestCase`.
- Any other sentence of `comparison.mdx`, and any other docs page.
- Adding benchmark cases. A case that times the console line is a known gap and is left for a later change.

## Git workflow

- Branch: `fix/bench-consola-throttle`, cut from the base commit your task names.
- Two commits, in this order:
  1. `fix(bench): stop the consola rows timing a duplicate check instead of a log line`
  2. `docs(comparison): describe the benchmark suites that exist`
- Each commit body is one or two short paragraphs of plain prose. The first says what the rows measured, the measured 5 of 1000, and that the start-up check now repeats each call.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Make the start-up check repeat each plain case

In `packages/bench/index.bench.ts`, give the check a count, and have `plainCase` ask for a burst. Target shape:

```ts
const expectLines = async (
  label: string,
  expected: number,
  run: () => unknown
): Promise<void> => {
  const before = linesWritten
  await run()
  await tick()
  const written = linesWritten - before
  if (written !== expected) {
    throw new Error(`${label}: expected ${expected} log lines, got ${written}`)
  }
}

// The timed loop repeats one call with the same arguments, so a library that
// drops repeats would be timed doing something other than logging.
const BURST = 20

const plainCase = async (label: string, fn: () => void): Promise<Case> => {
  await expectLines(label, BURST, () => {
    for (let call = 0; call < BURST; call += 1) {
      fn()
    }
  })
  return [label, fn]
}
```

`requestCase` calls `expectLines(label, 1, send)`. Remove `expectOneLine`: nothing else uses it.

**Verify**: `cd packages/bench && bun x vitest bench --run 2>&1 | tail -n 20` fails, and its output contains `consola: expected 20 log lines, got 5`. Keep that output for your report. If the run fails for a different logger, or passes, STOP.

### Step 2: Turn consola's duplicate check off

Change the consola instance to pass `throttle: 0`, and say why in the comment above it:

```ts
// Under vitest consola defaults to a level that drops info, so set it. Its
// default throttle drops a message repeated within a second, which is all the
// timed loop does.
const c = consola.create({ level: 3, reporters: [{ log: sink }], throttle: 0 })
```

**Verify**: `cd packages/bench && bun x vitest bench --run 2>&1 | tail -n 30` exits 0 and reports every suite as run, with no failed test. `cd packages/bench && bun run typecheck` exits 0. `bun run lint` at the root exits 0 (run `bun run format` first and read its diff). Commit as commit 1.

### Step 3: Correct the paragraph on the comparison page

Replace line 47 of `apps/docs/content/comparison.mdx` with this paragraph, as one line:

```
The benchmark package has a suite that times creating each logger, three plain-log suites in which six loggers write a string, an object and a deeply nested object into the same no-op sink, and four request suites: a **plugin request path** run that times each Elysia logging plugin from the request until its log line reaches the sink, a **no-logger reference** (plain Elysia with no plugin, the floor the others sit on), a **structured sink** run (logixlysia only, the `prod` and `json` presets writing to a no-op transport), and a **file sink** run (logixlysia only; the file write is not awaited, so it is not comparable with the others). Results vary by machine — use them for regression tracking, not absolute rankings.
```

Before you commit, check each statement of the new paragraph against `packages/bench/index.bench.ts` yourself: the creation suite, the number of plain-log suites and of loggers in each, the four request suites and what each contains. If one does not match the file, STOP.

**Verify**: `bun run lint` exits 0, `cd apps/docs && bun run typecheck` exits 0, and `grep -c 'overhead floor' apps/docs/content/comparison.mdx` prints 0. Commit as commit 2. `git status --porcelain` is empty afterwards (run `git checkout AGENTS.md` first if a tool modified it).

## Test plan

The bench has no test suite. Its start-up check is the test: Step 1 makes it fail with `consola: expected 20 log lines, got 5`, and Step 2 makes it pass. Quote both runs in your report.

## Done criteria

ALL must hold:

- [ ] `cd packages/bench && bun x vitest bench --run` exits 0 with every suite run
- [ ] `grep -n 'throttle: 0' packages/bench/index.bench.ts` prints one line; `grep -c expectOneLine packages/bench/index.bench.ts` prints 0
- [ ] `cd packages/bench && bun run typecheck` exits 0; `bun run lint` exits 0; `cd apps/docs && bun run typecheck` exits 0
- [ ] `git diff <base>..HEAD --stat` lists exactly `packages/bench/index.bench.ts` and `apps/docs/content/comparison.mdx`
- [ ] No suite or case name changed: `git diff <base>..HEAD -- packages/bench | grep -E "^[-+].*(suite\(|plainCase\('|requestCase\(')"` prints nothing

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code.
- After Step 1 the bench does not fail with the consola message, or fails for another logger. Another logger failing is a second finding, not something to fix here.
- After Step 2 a plain case still fails its check.
- A statement in the Step 3 paragraph does not match the bench file.

## Maintenance notes

- A logger added to the plain-log suites is now checked for dropped repeats at start-up, with no further work.
- No case times the console line: every request case sets `useTransportsOnly`, so the text and JSON line formatters never run in the bench. A slowdown there would pass unseen. Adding one request case per console format, with the console methods replaced by no-ops, is the follow-up.
- The plain-log suites give pino and winston a string to serialize while three others pass objects through. No page prints numbers from these suites, so it was left alone.
