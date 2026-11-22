# Plan 140: Tests that start a child process get their own timeout

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. Skip any instruction to update `plans/README.md`: the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/__tests__/api packages/logixlysia/__tests__/context/use-logger-fallback-warning.test.ts packages/logixlysia/__tests__/logger/bundled-app.test.ts packages/logixlysia/__tests__/logger/lazy-chalk.test.ts packages/logixlysia/__tests__/logger/lazy-pino.test.ts packages/logixlysia/__tests__/otel/otel.test.ts packages/logixlysia/__tests__/_helpers` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

Eight test files start a `bun` or `node` child process and wait for it. None of those tests sets a timeout, so each has Bun's default of 5 seconds. A child that imports the package normally answers in well under a second, but on a busy machine the process start alone can pass 5 seconds, and the test fails without any fault in the code. On 2026-11-22, with a load average of 13, the full suite at `c019a4f` reported 1242 pass and 7 fail, every failure one of these tests timing out between 5.0 and 9.6 seconds, while CI was green on the same commit. A contributor who runs the suite while a build or another test run is going sees red and cannot tell it from a real regression.

After this plan, each test that waits for a child process has a 30 second budget of its own. Nothing else about the tests changes, and tests that start no process keep the 5 second default.

## Current state

All paths are relative to `packages/logixlysia/`.

Bun's test timeout cannot be set in `bunfig.toml` on Bun 1.3.14 (a `[test] timeout = 100` entry was tried and ignored). It can be set per test, as the third argument of `test(name, fn, timeoutMs)`. A per-test value wins over the `--timeout` flag. This plan uses that fact for its proof: with `--timeout 100` a child-process test without its own timeout fails, and one with its own timeout passes.

`__tests__/adapters/shared.test.ts` already does this for its two child-process tests (`}, 10_000)` at lines 491 and 527). It is out of scope.

Helpers live in `__tests__/_helpers/`, one small module per helper with a named export. `__tests__/_helpers/sleep.ts` in full:

```ts
export const sleep = (ms: number): Promise<void> => {
  const { promise, resolve }: PromiseWithResolvers<void> =
    Promise.withResolvers()
  setTimeout(resolve, ms)
  return promise
}
```

The 18 call sites that need the timeout, by file:

1. `__tests__/api/errors-subpath.test.ts`: two of the three tests call `runInPackage`, which runs `spawnSync(['bun', '-e', script], …)`. They are `'throws an HttpError whose body the guard accepts after a JSON round trip'` (starts at line 55) and `'is the same HttpError class the package root exports'` (starts at line 78). The first test in the file, `'bundles with no dependency on a package or a node: module'`, starts no process and is not changed. Each test has this shape:

   ```ts
   test.skipIf(!distReady)(
     'is the same HttpError class the package root exports',
     () => {
       const output = runInPackage(`…`)
       expect(output.trim()).toBe('true')
     }
   )
   ```

2. `__tests__/api/import-cost.test.ts`: the single test, declared as `run('importing the plugin under node loads neither http nor zlib beyond Elysia', () => { … })` at lines 25 to 38, where `run` is `test` or `test.skip`.

3. `__tests__/api/surface.test.ts`: the test `'every exports subpath resolves and its named exports match the snapshot'` (lines 61 to 66) calls `resolveSurface()`, which runs `spawnSync(['bun', '-e', script], …)`. The second test, `'every bunup entry has an exports subpath and vice versa'`, starts no process and is not changed.

4. `__tests__/context/use-logger-fallback-warning.test.ts`: all four tests (starting at lines 46, 54, 63 and 69) await `runApp`, which runs `Bun.spawn([process.execPath, '-e', script], …)`. Shape:

   ```ts
   test('stays silent in production', async () => {
     const stderr = await runApp({ nodeEnv: 'production' })

     expect(countWarnings(stderr)).toBe(0)
   })
   ```

5. `__tests__/logger/bundled-app.test.ts`: two of the three tests call `runBundledApp`, which runs `spawnSync` twice (a `bun build` and then the bundle). They are `'logs through store.pino'` (starts at line 59) and `'logs through pino-pretty with prettyPrint'` (starts at line 65). The first test, `'runs where pino cannot be resolved'`, starts no process and is not changed.

6. `__tests__/logger/lazy-chalk.test.ts`: the three `run(…)` calls inside the `for (const [name, runtime, entry, runnable] of targets)` loop (starting at lines 94, 100 and 106). Each calls `observe`, which runs `spawnSync`. Shape:

   ```ts
   run(`${name}: a logger on a terminal loads chalk and colors`, () => {
     const seen = observe(runtime, entry, true)
     expect(seen).toMatchObject({ afterImport: false, afterLine: true })
     expect(seen.line).toContain('\u001B[')
   })
   ```

7. `__tests__/logger/lazy-pino.test.ts`: the four `run(…)` calls inside the same kind of loop (starting at lines 67, 72, 78 and 84).

8. `__tests__/otel/otel.test.ts`: the single test `'injectTraceContext is a no-op when OpenTelemetry is not installed'` (lines 26 to 37).

The before state, measured at `c019a4f` from `packages/logixlysia`:

```
$ bun test --timeout 100 ./__tests__/api/errors-subpath.test.ts ./__tests__/api/import-cost.test.ts ./__tests__/api/surface.test.ts ./__tests__/context/use-logger-fallback-warning.test.ts ./__tests__/logger/bundled-app.test.ts ./__tests__/logger/lazy-chalk.test.ts ./__tests__/logger/lazy-pino.test.ts ./__tests__/otel/otel.test.ts
 2 pass
 33 fail
Ran 35 tests across 8 files.
```

## Commands you will need

Run lint from the worktree root. Run everything else from `packages/logixlysia`.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `Build completed` |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail |
| The eight files, strict | the `bun test --timeout 100 …` command shown above | see Step 3 |

`bun test <files>` exits 1 on a subset even with zero failures, because the coverage threshold applies to the whole tree. Judge a subset by its pass and fail counts. The `dist/` directory must exist (run the build first), or the `dist` tests are skipped and prove nothing.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/__tests__/_helpers/child-process.ts` (create)
- `packages/logixlysia/__tests__/api/errors-subpath.test.ts`
- `packages/logixlysia/__tests__/api/import-cost.test.ts`
- `packages/logixlysia/__tests__/api/surface.test.ts`
- `packages/logixlysia/__tests__/context/use-logger-fallback-warning.test.ts`
- `packages/logixlysia/__tests__/logger/bundled-app.test.ts`
- `packages/logixlysia/__tests__/logger/lazy-chalk.test.ts`
- `packages/logixlysia/__tests__/logger/lazy-pino.test.ts`
- `packages/logixlysia/__tests__/otel/otel.test.ts`
- `.changeset/child-process-test-timeouts.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/__tests__/adapters/shared.test.ts`. Its child-process tests already have a timeout, and another pull request is editing that file.
- `packages/logixlysia/bunfig.toml`, `packages/logixlysia/package.json` and anything under `.github/`. The fix is per test. Do not add a `--timeout` flag to a script.
- Anything under `packages/logixlysia/src/`. This plan changes no shipped code.
- The body, name or assertions of any test. Only the third argument is added.
- The tests named above as starting no process.

## Git workflow

- Branch: `test/child-process-timeouts`, cut from the base commit your task names.
- One commit, subject `test: give tests that start a child process their own timeout`, with a body of one or two short paragraphs in plain prose that say what failed and why (the 5 second default, a child process that starts slowly on a busy machine) and what the change does. The empty changeset goes in the same commit.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Confirm the before state

From `packages/logixlysia`, after the install and the build, run the `bun test --timeout 100 …` command from "Current state".

**Verify**: the summary shows `33 fail` (a count from 31 to 33 is acceptable, because the two or three tests that start no process may pass or fail at 100 ms). If it shows fewer than 25 failures, the premise of this plan does not hold: STOP.

### Step 2: Add the helper

Create `packages/logixlysia/__tests__/_helpers/child-process.ts` with exactly one export and one comment that says why the value is what it is:

```ts
/**
 * Budget for a test that waits on a `bun` or `node` child process. The
 * default of 5 s is too short when the machine is busy: the process start
 * alone has been seen to take 9 s.
 */
export const CHILD_PROCESS_TIMEOUT_MS = 30_000
```

**Verify**: `cd packages/logixlysia && bun run typecheck` exits 0.

### Step 3: Pass the timeout at the 18 call sites

In each of the eight test files, import the constant from the helper (the relative path is `../_helpers/child-process`; put the import where the linter's import order wants it, after the `bun` and `node:` imports) and add `CHILD_PROCESS_TIMEOUT_MS` as the last argument of each call listed in "Current state". Examples of the result:

```ts
test.skipIf(!distReady)(
  'is the same HttpError class the package root exports',
  () => {
    const output = runInPackage(`…`)
    expect(output.trim()).toBe('true')
  },
  CHILD_PROCESS_TIMEOUT_MS
)
```

```ts
run(
  `${name}: a logger on a terminal loads chalk and colors`,
  () => {
    const seen = observe(runtime, entry, true)
    expect(seen).toMatchObject({ afterImport: false, afterLine: true })
    expect(seen.line).toContain('\u001B[')
  },
  CHILD_PROCESS_TIMEOUT_MS
)
```

```ts
test(
  'stays silent in production',
  async () => {
    const stderr = await runApp({ nodeEnv: 'production' })

    expect(countWarnings(stderr)).toBe(0)
  },
  CHILD_PROCESS_TIMEOUT_MS
)
```

Then run `bun run format` at the root and read its diff: it may re-wrap the calls you changed, and it must not change any other file. If it changes another file, restore that file with `git checkout -- <file>`.

**Verify**, from `packages/logixlysia`:

1. `grep -c CHILD_PROCESS_TIMEOUT_MS __tests__/api/errors-subpath.test.ts __tests__/api/import-cost.test.ts __tests__/api/surface.test.ts __tests__/context/use-logger-fallback-warning.test.ts __tests__/logger/bundled-app.test.ts __tests__/logger/lazy-chalk.test.ts __tests__/logger/lazy-pino.test.ts __tests__/otel/otel.test.ts` prints, in that order, the counts 3, 2, 2, 5, 3, 4, 5, 2 (one import plus the call sites in each file).
2. The `bun test --timeout 100 …` command from "Current state", with its output saved to a file outside the worktree, shows at most 3 failures, and this prints nothing:

   ```
   grep '^(fail)' <saved output> | grep -v -e 'bundles with no dependency on a package' -e 'every bunup entry has an exports subpath' -e 'runs where pino cannot be resolved' -e '(unnamed)'
   ```

   A line `(fail) (unnamed)` is a `beforeAll` or `afterAll` hook in `bundled-app.test.ts` passing 100 ms. If it appears, run the command once more. If the two `bundled-app` child-process tests are then missing from the output on both runs, raise the flag to `--timeout 500` for this check and say so in your report.

### Step 4: Add the empty changeset

This change ships nothing to users, so the changeset is empty, as it was for the last test-only change in this repository. Create `.changeset/child-process-test-timeouts.md` containing exactly two lines:

```
---
---
```

**Verify**: `cat .changeset/child-process-test-timeouts.md | wc -l` prints 2.

### Step 5: Gates and commit

From the root: `bun run lint`. From `packages/logixlysia`: `bun run typecheck`, then `bun test`.

**Verify**: lint exit 0, typecheck exit 0, and the full suite reports `0 fail` with 1249 tests in 100 files. Then make the one commit described under "Git workflow", staging the ten files by name. `git status --porcelain` is empty afterwards (run `git checkout AGENTS.md` first if a tool modified it).

## Test plan

No new test. The proof that the change does what it says is the pair of runs with `--timeout 100`: 33 failures before, and after it no failure among the 32 tests that start a child process. Put both summaries in your report.

## Done criteria

ALL must hold:

- [ ] `git diff --stat <base>..HEAD` lists exactly the ten in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src` is empty
- [ ] The eight files run with `--timeout 100` show no failing child-process test (the grep in Step 3 prints nothing)
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] No test name, test body or assertion differs from the base: `git diff <base>..HEAD -- packages/logixlysia/__tests__ | grep '^-' | grep -v '^---'` shows only lines that were re-wrapped to take the new argument (opening `test(` or `run(` lines and closing `})` lines)

## STOP conditions

Stop and report (do not improvise) if:

- Step 1 shows fewer than 25 failures with `--timeout 100`.
- After Step 3 a child-process test still fails with `--timeout 100`. That would mean the per-test value does not win over the flag on this Bun version, and the plan's approach is wrong.
- A test in the eight files fails in the full suite for a reason other than a timeout.
- The fix seems to need a change to `bunfig.toml`, `package.json`, a workflow or a file under `src/`.

## Maintenance notes

- A new test that starts a child process should pass `CHILD_PROCESS_TIMEOUT_MS`. A reviewer can find the ones that do not with `grep -L CHILD_PROCESS_TIMEOUT_MS $(grep -l -E 'spawnSync|Bun\.spawn' -r packages/logixlysia/__tests__)`, which after this plan lists only `__tests__/adapters/shared.test.ts`.
- `__tests__/adapters/shared.test.ts` keeps its own `10_000` and also asserts that the child exits within `MAX_EXIT_MS` (5 s) of wall-clock time. That assertion can fail from load alone and is left for a later change, because the file is being edited elsewhere.
- The module-level `spawnSync` in `lazy-chalk.test.ts` that probes for `registerHooks` runs outside any test, so no test timeout applies to it.
