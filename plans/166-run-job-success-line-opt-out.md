# Plan 166: `runJob` can skip the final line of a job that succeeds

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. Do not edit `plans/README.md`; the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 6a516de2..HEAD -- packages/logixlysia/src/index.ts packages/logixlysia/__tests__/plugin/run-job.test.ts apps/docs/content/features/background-jobs.mdx apps/docs/content/api-reference.mdx skills/logixlysia/SKILL.md` If any of them changed, compare the "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `6a516de2`, 2026-11-28

## Why this matters

`plugin.runJob(name, fn)` always writes one final `JOB` line. A queue consumer or a cron that runs every few seconds then sends one success record per run to every transport, and the only ways to drop them (`logFilter.level`, a head sampling rate of 0 for `INFO`) also drop every other `INFO` line of the app. Job monitoring usually wants failures only. This plan adds a third argument, `{ successLine: false }`, that writes no final line when `fn` returns and leaves the error line of a job that throws exactly as it is.

## Current state

`packages/logixlysia/src/index.ts`:

- Lines 339–354, the public type:

```ts
export type LogixlysiaPlugin<TFields extends object = LogFields> =
  Logixlysia<TFields> & {
    /**
     * Runs `fn` as a job outside any request and writes one final line for it
     * (method `JOB`, status 200, or 500 when `fn` throws) through every sink,
     * with the context accumulated by `log` or `useLogger()` inside. The
     * line is written even when `fn` logs its own lines. An error is logged
     * and then rethrown unchanged; otherwise the value `fn` returns is returned.
     */
    runJob: <T>(
      name: string,
      fn: (log: RequestScopedLogger<TFields>) => T | Promise<T>
    ) => Promise<T>
    wrapWs: ReturnType<typeof createWsHandlerWrapper>
  }
```

- Lines 812–829, `finishJob`:

```ts
const finishJob = (
  request: Request,
  record: RequestRecord,
  status: number,
  error?: unknown
): void => {
  record.phase = 'closed'
  try {
    const store = closeRequest(request, {}, status)
    if (status >= CLIENT_ERROR_STATUS) {
      logger.handleHttpError(request, error, { ...store, status })
    } else {
      emitAccessLine(request, status, store)
    }
  } catch (failure) {
    reportFormatError(failure, onSinkError)
  }
}
```

- Lines 831–859, `runJob`: validates `name`, builds a synthetic request, opens the scope, runs `fn` inside `loggerStorage.run`, calls `finishJob(request, record, SERVER_ERROR_STATUS, error)` and rethrows on a throw, and `finishJob(request, record, DEFAULT_STATUS)` on success.
- The file's public exports are at the bottom (around lines 1045–1098). The published surface is pinned by `packages/logixlysia/__tests__/api/surface.test.ts` and its snapshot; a new exported type changes the snapshot.

Tests: `packages/logixlysia/__tests__/plugin/run-job.test.ts`. It has a `build(config)` helper returning `{ events, logs }` where `events` is every transport call as `{ level, message, meta }`, and tests such as:

```ts
  test('returns the value and writes one JOB line with status and duration', async () => {
    const { events, logs } = build()
    const value = await logs.runJob('nightly-sync', () => 42)
    expect(value).toBe(42)
    expect(events).toHaveLength(1)
```

Docs that describe `runJob`:

- `apps/docs/content/features/background-jobs.mdx` — section `## Outcome` starts with the bullet "The final line is always written, even when the job logs lines of its own, as a request's access line is."
- `apps/docs/content/api-reference.mdx` — section `### \`runJob\``with the signature in a`ts check=skip` block.
- `skills/logixlysia/SKILL.md` — section `## 15. Background jobs`.

Docs voice: short declarative sentences, no em dash, say what the code does. These pages must not name any other logging library.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (repo root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && bun test __tests__/plugin/run-job.test.ts` | all pass |
| Update API snapshot | `cd packages/logixlysia && bun run build && bun test --update-snapshots __tests__/api` | pass |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1556 pass before) |
| Lint / format / typecheck | `bun run lint`, `bun run format`, `bun run typecheck` (repo root) | exit 0 |

`turbo` may append a block to the root `AGENTS.md` when it runs. Never commit that: run `git checkout -- AGENTS.md` before each commit.

## Scope

**In scope**:

- `packages/logixlysia/src/index.ts` (the `LogixlysiaPlugin` type, a new exported `RunJobOptions` type, `finishJob`, `runJob`)
- `packages/logixlysia/__tests__/plugin/run-job.test.ts`
- `packages/logixlysia/__tests__/api/__snapshots__/*` (only through `--update-snapshots`)
- `apps/docs/content/features/background-jobs.mdx`, `apps/docs/content/api-reference.mdx`, `skills/logixlysia/SKILL.md`
- `.changeset/run-job-success-line.md` (create)

**Out of scope**: sampling, `logFilter`, `wrapWs`, the request path, any other docs page, `packages/logixlysia/README.md`.

## The interface (settled; do not vary it)

```ts
export interface RunJobOptions {
  /**
   * `false` writes no final line when `fn` returns. A job that throws still
   * gets its error line, and lines `fn` logs itself are written as usual.
   * Default `true`.
   */
  successLine?: boolean
}

runJob: <T>(
  name: string,
  fn: (log: RequestScopedLogger<TFields>) => T | Promise<T>,
  options?: RunJobOptions
) => Promise<T>
```

Behavior:

- `successLine` omitted, `undefined` or `true`: exactly today's behavior.
- `successLine: false` and `fn` returns: `closeRequest` still runs (the scope, sampling state and context are closed as today); `emitAccessLine` is not called. Nothing reaches a transport, the console or the file for the final line.
- `successLine: false` and `fn` throws: unchanged, the error line is written and the error rethrown.
- Any other value of `successLine` (not a boolean, not undefined): reject with `new TypeError("logixlysia: runJob options.successLine must be a boolean, e.g. plugin.runJob('nightly-sync', fn, { successLine: false })")` before `fn` runs, in the same place and style as the existing name check.

Implementation shape: give `finishJob` what it needs to skip the success line (for example a fifth parameter `successLine = true` and `else if (successLine)` around `emitAccessLine`). Keep it that small.

## Git workflow

- Work on the branch you were started on (`feat/run-job-success-line`). Do not push, do not open a pull request.
- Three commits: `feat(plugin): let runJob skip the final line of a job that succeeds` (source, tests, snapshot), `docs(jobs): document runJob's successLine option` (the three docs files), `chore(changeset): add run-job-success-line`.
- Commit with `git -c commit.gpgsign=false commit`, subject plus a short body that says why. No `Co-Authored-By`, no "Generated with", no mention of any AI tool or model.

## Steps

### Step 1: Failing tests

Add to `run-job.test.ts`, using `build()`:

1. `successLine: false` and `fn` returns 42 → resolves 42, `events` has length 0.
2. `successLine: false` and `fn` calls `log.info('step')` then returns → `events` has exactly one event, whose message is `'step'` (the job's own line is still written, the final line is not).
3. `successLine: false` and `fn` throws `new Error('boom')` → the promise rejects with that same error object, and `events` has exactly one event with level `'ERROR'` and `meta.status` 500.
4. `successLine: true` → one event with `meta.status` 200 (same as default).
5. `successLine: 'no' as unknown as boolean` → rejects with a `TypeError` whose message contains `successLine`, and `fn` (a `mock`) was not called.
6. After a `successLine: false` job returns, `useLogger()` called outside is the no-op logger again: follow the existing test in this file that checks `useLogger()` after a job settles, if there is one; if there is none, skip this case.

**Verify**: `bun test __tests__/plugin/run-job.test.ts` → cases 1, 2 and 5 fail (TypeScript may also reject the third argument; that counts as failing).

### Step 2: Implement

Apply "The interface" section. Export `RunJobOptions` next to the other exported types at the bottom of `src/index.ts` if types are exported there by name; if `LogixlysiaPlugin` is exported inline with `export type`, export `RunJobOptions` inline the same way. Update the JSDoc on `runJob` in `LogixlysiaPlugin`: replace "The line is written even when `fn` logs its own lines." with a sentence that also says `{ successLine: false }` skips it for a job that returns. Update the `TypeError` text of the name check only if it lists the signature and would now be wrong; otherwise leave it.

**Verify**: `bun test __tests__/plugin/run-job.test.ts` → all pass.

### Step 3: API snapshot and full verification

`bun run build && bun test --update-snapshots __tests__/api`, then inspect `git diff -- packages/logixlysia/__tests__/api`: the only change must be the added `RunJobOptions` export (and the `runJob` signature if the snapshot includes it). Then full suite, lint, typecheck.

### Step 4: Docs

- `features/background-jobs.mdx`, `## Outcome`: change the first bullet to say the final line is written even when the job logs lines of its own, unless the job was started with `{ successLine: false }` and returns. Add a short section after `## Outcome`:

````md
## Failures only

A job that runs often can skip the line for a run that succeeds. Pass `{ successLine: false }`:

```ts
await logs.runJob(
  'poll-queue',
  async log => {
    await drainQueue()
  },
  { successLine: false }
)
```

A run that returns writes no final line. A run that throws writes its error line and rethrows, as before. Lines the job logs itself with `log.info` and the other methods are written either way.
````

Look at the first code block of that page: if it defines `logs` in a way the docs typecheck needs (`apps/docs` checks snippets in CI; blocks marked `ts check=skip` are skipped), mirror how the page's other small snippets are marked so the docs build stays green. `drainQueue` is not defined anywhere, so mark this block `ts check=skip` unless the page's other snippets show a better pattern.

- `api-reference.mdx`, `### \`runJob\``: add the third parameter to the signature block and one sentence describing `successLine`.
- `skills/logixlysia/SKILL.md`, section 15: add one sentence with the option.

**Verify**: `bun run lint` exit 0; `grep -rn "successLine" apps/docs/content skills/logixlysia/SKILL.md` shows the three files. If the repo has a docs snippet check you can run locally (look in `apps/docs/package.json` scripts and the root `turbo.json` for a `typecheck` or `check` task covering docs), run it; `bun run typecheck` at the root must exit 0.

### Step 5: Changeset

`.changeset/run-job-success-line.md`:

```md
---
'logixlysia': minor
---

`runJob(name, fn, { successLine: false })` writes no final line for a job that returns, so a job that runs often can report failures only. A job that throws still gets its error line, and lines the job logs itself are written as before. The option's type is exported as `RunJobOptions`.
```

## Done criteria

- [ ] `cd packages/logixlysia && bun run build && bun test` → 0 fail
- [ ] `bun run lint` and `bun run typecheck` exit 0
- [ ] `git diff --stat origin/main..HEAD` lists only in-scope files
- [ ] `git log origin/main..HEAD --format=%B | grep -ciE 'co-authored|generated with|claude|devin|codex|gpt'` prints `0`
- [ ] `git diff origin/main..HEAD | grep -ci evlog` prints `0`
- [ ] `git status --short` is empty

## STOP conditions

- `finishJob` or `runJob` do not match the excerpts.
- Skipping `emitAccessLine` leaves something observable behind that a test catches (for example buffered sampling records are flushed or lost differently): report what you saw.
- The API snapshot diff contains anything other than the new type and the `runJob` signature.

## Maintenance notes

- The option is per call on purpose; a plugin-wide default was not added because `logFilter` and sampling already cover plugin-wide policy.
- Records a job buffered for tail sampling are finalized by `closeRequest` as before; with `successLine: false` a successful job has no final line for a tail rule to rescue them with, which matches "report failures only".
