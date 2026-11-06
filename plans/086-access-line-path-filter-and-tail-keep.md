# Plan 086: The access line can be filtered by path, tail sampling takes a predicate, and every config type is importable

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 1f1d591..HEAD -- packages/logixlysia/src apps/docs/content/features/filtering.mdx apps/docs/content/features/sampling.mdx apps/docs/content/configuration.mdx apps/docs/content/api-reference.mdx` must print nothing. If a cited excerpt does not read as quoted below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the line every request writes)
- **Depends on**: none. Plan 088 builds on this one.
- **Category**: direction
- **Planned at**: commit `1f1d591`, 2026-11-06

## Why this matters

A team that points a load balancer at `/health` gets a log line per probe, and the docs say so plainly: `features/filtering.mdx` ends with "Path-based include/exclude filtering is not currently available." The glob compiler already exists for tail sampling. Separately, tail sampling can rescue by status, duration or path, but not by anything the handler learned ("keep every line for this tenant"), because `TailSamplingConfig` is a closed struct. Finally, six config sub-types exist but cannot be imported from the package root, so a user cannot name them when they wrap the config.

## Decisions already made (do not reopen)

Taken with the maintainer's co-decider. They are the spec.

1. The option is `logFilter.accessLine?: { include?: string[]; exclude?: string[] }`. It is nested because `logFilter.level` filters every record while this filters one line; a flat `include` next to `level` would read as the same set of records.
2. Precedence, in order:
   - A response with status `>= 400`, or a thrown error, is never hidden.
   - A pathname longer than 2048 characters is never hidden. The matcher skips such paths, and `include` would otherwise hide them.
   - `exclude` beats `include`.
   - With a non-empty `include`, a path it does not match is hidden.
   - An empty array is the same as leaving the key out.
3. Only the access line is hidden. A handler's `log.*` lines still write. Enrichers still run. Tail rescue does not bring a hidden access line back.
4. The check sits in the access branch of `finishRequest`, not in `emitAccessLine`, because plan 088 reuses `emitAccessLine` for jobs and an `include: ['/api/**']` must not hide those.
5. `sampling.tail.keep?: (outcome: RequestOutcome) => boolean`, OR-ed with the other tail rules. `RequestOutcome` gains a required `context: Readonly<Record<string, unknown>>`. The context is cloned only when `keep` is set.
6. A throwing `keep` counts as no match and reports through `onError` with a new sink `'sampling'`. The guard lives inside `finalize`, because a throw that reached `finishRequest` would lose the access line.
7. `keep` is inert without head rates, like every other tail rule, and the docs must say so.

## Current state

- `packages/logixlysia/src/sampling/glob.ts`: exports `globToRegExp`.
- `packages/logixlysia/src/sampling/index.ts:57-93`:

```ts
const resolveTail = (
  tail: TailSamplingConfig | undefined
): ResolvedTail | undefined => {
  if (!tail) {
    return
  }

  const paths = tail.paths?.length ? tail.paths.map(globToRegExp) : undefined
  if (
    tail.durationMs === undefined &&
    tail.status === undefined &&
    paths === undefined
  ) {
    return
  }

  return { durationMs: tail.durationMs, paths, status: tail.status }
}

const MAX_MATCHED_PATHNAME_LENGTH = 2048

const matchesTail = (tail: ResolvedTail, outcome: RequestOutcome): boolean => {
  if (tail.status !== undefined && outcome.status >= tail.status) {
    return true
  }
  if (tail.durationMs !== undefined && outcome.durationMs >= tail.durationMs) {
    return true
  }
  if (tail.paths && outcome.pathname.length <= MAX_MATCHED_PATHNAME_LENGTH) {
    for (const path of tail.paths) {
      if (path.test(outcome.pathname)) {
        return true
      }
    }
  }
  return false
}
```

- `packages/logixlysia/src/sampling/index.ts:121-124`: `resolveSampling(config, random = Math.random)`. `:178`: `if (!(tail && matchesTail(tail, outcome))) { return NO_RECORDS }`.
- `packages/logixlysia/src/logger/index.ts:151`: `const sampling = resolveSampling(config?.sampling)`. `:180-184` builds the outcome:

```ts
const outcome = {
  durationMs: elapsedMs(store.beforeTime),
  pathname: parseRequestUrlOnce(request).pathname,
  status
}
```

- `packages/logixlysia/src/context/request-context.ts:45`: `getContext` returns a clone. Use it, not `peekContext`, for anything user code receives.
- `packages/logixlysia/src/index.ts:530-537`, the access branch:

```ts
if (
  record.error !== undefined &&
  (status >= 400 || !isStatusResponse(record.error))
) {
  logger.handleHttpError(request, record.error, { ...store, status })
} else if (!record.accessLineReplaced) {
  emitAccessLine(request, status, store)
}
```

- `packages/logixlysia/src/index.ts:25`: `import { isSuppressed, reportFormatError, resolveSinks } from './logger/emit'`. `parseRequestUrlOnce` is exported from the same module.
- `packages/logixlysia/src/index.ts:775-799`: the `export type { … } from './interfaces'` list. `src/interfaces.ts` already exports `FormattingConfig`, `OutputConfig`, `PinoConfig`, `PrettyPrintConfig`, `RedactionConfig` and `RequestTrackingConfig`.
- `packages/logixlysia/src/types/config.ts:48-54` is `LogFilter`; `:67-77` is `TailSamplingConfig`; `:113-116` is `SinkErrorContext`.
- `packages/logixlysia/src/config/resolve-options.ts:171-185`:

```ts
const validateLogFilter = (config: Options['config']): void => {
  const level = config?.logFilter?.level
  if (level === undefined) {
    return
  }

  const isKnownLevelList =
    Array.isArray(level) &&
    level.every(entry => VALID_SAMPLING_LEVELS.includes(entry))
  if (!isKnownLevelList) {
    invalidLogFilter(
      `level must be an array of DEBUG, INFO, WARNING or ERROR, got ${JSON.stringify(level)}`
    )
  }
}
```

- `packages/logixlysia/src/utils/report.ts`: `createErrorReporter(sink, label)` returns `(error, onError) => void`. Match it.
- Test patterns: `__tests__/sampling/plugin.test.ts` (capture transport, `buildApp`), `__tests__/sampling/runtime.test.ts` (ten `finalize(` calls that need `context: {}` once the field is required), `__tests__/types/root-type-exports.test.ts`.
- Repo style: arrow functions, top-level regex and constants, no comments unless the code cannot show the why, oxlint and oxfmt enforced. Never disable a lint rule or add an ignore comment; restructure instead.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (repo root) | exit 0 |
| Lint and format | `bun run lint`, `bun run format` (repo root) | exit 0 |
| Typecheck | `bun run typecheck` (repo root) | exit 0 (docs snippets compile) |
| Tests | `cd packages/logixlysia && bun run build && bun test` | all pass |

## Scope

**In scope**:

- `packages/logixlysia/src/sampling/glob.ts`, `src/sampling/index.ts`, `src/sampling/access-line.ts` (create)
- `packages/logixlysia/src/logger/index.ts`, `src/index.ts`, `src/types/config.ts`, `src/config/resolve-options.ts`
- `packages/logixlysia/__tests__/plugin/access-line-filter.test.ts` (create), `__tests__/sampling/plugin.test.ts`, `__tests__/sampling/runtime.test.ts`, `__tests__/types/root-type-exports.test.ts`, and the `resolve-options` test file (find it with `grep -rl "invalid logFilter" packages/logixlysia/__tests__`)
- `apps/docs/content/features/filtering.mdx`, `features/sampling.mdx`, `configuration.mdx`, `api-reference.mdx`
- `.changeset/access-line-path-filter.md`, `.changeset/tail-keep-predicate.md`, `.changeset/export-config-sub-types.md` (create)

**Out of scope**: `wrapWs`, the WebSocket path, `handleHttpError`, the "handler line replaces the access line" behaviour, any per-route service mapping, a `keep` rule on `createLogger` outside the plugin, the API snapshot (types are not in it and no runtime export is added).

## Git workflow

- Branch `improve/086-access-line-filter-and-tail-keep`.
- Commits, one per step group: `feat(filter): hide the access line by path`, `feat(sampling): add a tail keep predicate`, `feat(types): export the config sub-types from the root`.
- `git -c commit.gpgsign=false commit …`; no trailers. Run `git checkout -- AGENTS.md` before committing, because turbo rewrites that file. Do not push.

## Steps

### Step 1: Failing tests for the access-line filter

Create `__tests__/plugin/access-line-filter.test.ts`, modelled on `__tests__/sampling/plugin.test.ts`. Cases:

1. `exclude: ['/health']`: `GET /health` with 200 writes no record; `GET /api/x` writes its line.
2. On an excluded route, a handler's `log.info('note')` still writes that line, and an enricher's field is on it.
3. An excluded route that sets `set.status = 503` writes its line at `ERROR`.
4. An excluded route that throws writes the error line.
5. `include: ['/api/**']`: `/other` with 200 is hidden, `/api/x` is written, and a 404 on an unknown path is written.
6. `exclude` beats `include` for a path both match.
7. With `include: ['/api/**']`, a 200 on a pathname longer than 2048 characters is written.
8. `include: []` and `exclude: []` hide nothing.
9. `sampling: { head: { INFO: 0 }, tail: { durationMs: 0 } }` with `exclude: ['/health']` writes no record for `/health`.
10. Case 1 again with `new Elysia({ aot: false })`, the unwrapped path.

**Verify**: `cd packages/logixlysia && bun test __tests__/plugin/access-line-filter.test.ts` shows cases 1, 5, 6 and 10 failing and no crash. Cases that assert a line is still written may already pass.

### Step 2: Implement the filter

In `sampling/glob.ts` add, moving the constant from `sampling/index.ts`:

```ts
const MAX_MATCHED_PATHNAME_LENGTH = 2048

export const isMatchablePath = (pathname: string): boolean =>
  pathname.length <= MAX_MATCHED_PATHNAME_LENGTH

export const matchesAnyGlob = (
  globs: readonly RegExp[],
  pathname: string
): boolean => globs.some(glob => glob.test(pathname))
```

Rewrite the path arm of `matchesTail` with them: `if (tail.paths && isMatchablePath(outcome.pathname) && matchesAnyGlob(tail.paths, outcome.pathname)) { return true }`.

Create `sampling/access-line.ts`:

```ts
import type { LogFilter } from '../interfaces'
import { globToRegExp, isMatchablePath, matchesAnyGlob } from './glob'

export const resolveAccessLineFilter = (
  filter: LogFilter['accessLine']
): ((pathname: string) => boolean) | undefined => {
  const exclude = filter?.exclude?.map(globToRegExp) ?? []
  const include = filter?.include?.map(globToRegExp) ?? []
  if (exclude.length === 0 && include.length === 0) {
    return
  }
  return pathname => {
    if (!isMatchablePath(pathname)) {
      return false
    }
    if (matchesAnyGlob(exclude, pathname)) {
      return true
    }
    return include.length > 0 && !matchesAnyGlob(include, pathname)
  }
}
```

In `types/config.ts` add to `LogFilter`:

```ts
  /**
   * Hides the access line for matching paths. `exclude` beats `include`. A
   * status of 400 or above, a thrown error and a handler's own log lines are
   * never hidden. Uses the globs of `sampling.tail.paths`.
   */
  accessLine?: {
    exclude?: string[]
    include?: string[]
  }
```

In `src/index.ts`, next to `const logFilter = …`:

```ts
const hidesAccessLinePath = resolveAccessLineFilter(
  options.config?.logFilter?.accessLine
)
const hidesAccessLine = (request: Request, status: number): boolean =>
  status < CLIENT_ERROR_STATUS &&
  hidesAccessLinePath?.(parseRequestUrlOnce(request).pathname) === true
```

Add `const CLIENT_ERROR_STATUS = 400` beside `SERVER_ERROR_STATUS`, and change the access branch to `else if (!(record.accessLineReplaced || hidesAccessLine(request, status)))`. Leave the error branch alone.

**Verify**: the Step 1 file passes. `bun test __tests__/sampling` passes.

### Step 3: Validate the option

Restructure `validateLogFilter` so a missing `level` no longer returns early, and add:

```ts
const isGlobList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(entry => typeof entry === 'string' && entry.length > 0)
```

For each of `accessLine.include` and `accessLine.exclude`, when defined and not a glob list, call `invalidLogFilter('accessLine.<key> must be an array of non-empty glob strings')`. Add cases to the `resolve-options` test file: a string instead of an array, an empty string entry. A rejected glob such as `**/**` must throw when the plugin is constructed; add that to the Step 1 file.

**Verify**: `bun test __tests__/config` passes (or the directory the `resolve-options` tests are in).

### Step 4: The tail predicate

Failing tests first. In `__tests__/sampling/plugin.test.ts`:

- `head: { INFO: 0 }, tail: { keep: ({ context }) => context.plan === 'enterprise' }`: a handler that runs `log.mergeContext({ plan: 'enterprise' })` gets its records replayed; one with `plan: 'free'` gets none.
- `keep` receives `durationMs` (a number), `pathname`, `status` and `context`.
- A `keep` that mutates `context` does not change the context on later lines. Assign through a cast in the test.
- A `keep` that throws: `onError` receives `sink: 'sampling'`, nothing is replayed, and the request's response is unaffected.

In `__tests__/sampling/runtime.test.ts`: add `context: {}` to every `finalize` outcome; `keep` without `head` makes `resolveSampling` return `undefined`. In the `resolve-options` tests: `tail.keep: 'x'` throws `invalid sampling config`.

Then implement:

- `sampling/index.ts`: add `context: Readonly<Record<string, unknown>>` to `RequestOutcome`. Add `keep?: TailSamplingConfig['keep']` to `ResolvedTail`, include it in the early-return condition and the returned object. Change the signature to `resolveSampling(config, random = Math.random, onError?: (context: SinkErrorContext) => void)`.
- Add, at module level, `const reportKeepError = createErrorReporter('sampling', 'tail keep predicate failed')`, and:

```ts
const matchesKeep = (
  keep: NonNullable<ResolvedTail['keep']>,
  outcome: RequestOutcome,
  onError: ((context: SinkErrorContext) => void) | undefined
): boolean => {
  try {
    return keep(outcome) === true
  } catch (error) {
    reportKeepError(error, onError)
    return false
  }
}
```

`matchesTail` takes `onError` and ends with `return tail.keep !== undefined && matchesKeep(tail.keep, outcome, onError)`, so the cheap rules run first.

- `types/config.ts`: add to `TailSamplingConfig`:

```ts
  /**
   * Rescue when this returns `true`, for a rule the other fields cannot state.
   * A predicate that throws is reported to `onError` and counts as no match.
   */
  keep?: (outcome: RequestOutcome) => boolean
```

`RequestOutcome` is defined in `sampling/index.ts`, which imports from `interfaces`. Define the interface in `types/config.ts` instead, re-export it from `sampling/index.ts` so `src/index.ts:806` keeps working, and add `'sampling'` to the `SinkErrorContext['sink']` union.

- `logger/index.ts`: `resolveSampling(config?.sampling, Math.random, config?.onError)`. In the outcome object add `context: config?.sampling?.tail?.keep ? contextStore.getContext(request) : NO_CONTEXT`, with a top-level `const NO_CONTEXT: Readonly<Record<string, unknown>> = Object.freeze({})`.
- `resolve-options.ts`: `tail.keep` when defined must be a function, else `invalidSampling('tail.keep must be a function')`.

**Verify**: `bun test __tests__/sampling` passes.

### Step 5: Export the six types

Add `FormattingConfig`, `OutputConfig`, `PinoConfig`, `PrettyPrintConfig`, `RedactionConfig` and `RequestTrackingConfig` to the `export type { … } from './interfaces'` list in `src/index.ts`, keeping it sorted. Extend `__tests__/types/root-type-exports.test.ts` to import and use all six.

**Verify**: `bun run typecheck` exits 0; after `cd packages/logixlysia && bun run build`, `grep -c "FormattingConfig" dist/index.d.ts` is at least 1.

### Step 6: Docs and changesets

- `features/filtering.mdx`: replace "Path-based include/exclude filtering is not currently available." with a `## Hiding the access line by path` section: an example excluding `/health` and `/metrics`, the precedence list from "Decisions" as a short list, and one sentence each that handler lines and enrichers are unaffected, that tail sampling does not bring a hidden line back, and that the option has no effect on a `createLogger` instance used outside the plugin. Link to the glob table in `features/sampling.mdx`.
- `features/sampling.mdx`: add `keep` to the Tail Sampling section with a compound example such as `keep: ({ context, status }) => context.plan === 'enterprise' && status >= 400`; state that it needs head rates like every other rule, that it runs after the other rules, that a throw reports with `sink: 'sampling'` and counts as no match. Add the validation bullet.
- `configuration.mdx:422`: the `logFilter` type line becomes `{ level?: LogLevel[]; accessLine?: { include?: string[]; exclude?: string[] } }`, and add the validation sentence. `:340`: add `'sampling'` to the sink union and to the sentence at `:338`.
- `api-reference.mdx:272` and the `LogFilter` block at `:279`: the same two changes. Add a line that every config sub-type is importable from `logixlysia`.
- Changesets, each with front matter `'logixlysia': minor` (the type export one `patch`) and one sentence that says what the user can now do.

**Verify**: `bun run format && bun run lint && bun run typecheck` exit 0, and `cd packages/logixlysia && bun run build && bun test` passes.

## Test plan

Sixteen or more new tests across the files above. Every new behaviour test must fail against the unfixed source; confirm that by running them before each implementation step.

## Done criteria

- [ ] `bun run lint` and `bun run typecheck` exit 0 at the repo root
- [ ] `cd packages/logixlysia && bun run build && bun test` passes with the API snapshot unchanged (`git diff --stat -- packages/logixlysia/__tests__/api` prints nothing)
- [ ] `grep -n "not currently available" apps/docs/content/features/filtering.mdx` prints nothing
- [ ] `git status --short` lists only in-scope paths

## STOP conditions

- A test outside the in-scope list starts failing and the fix is not a one-line `context: {}`.
- `src/index.ts` needs a change to `emitAccessLine` itself.
- Moving `RequestOutcome` to `types/config.ts` creates an import cycle that the typecheck rejects.
- `aot: false` (case 10) cannot be made to pass from the access branch alone.

## Maintenance notes

- Plan 088 reuses `emitAccessLine` for jobs; this filter must stay out of it.
- Review the precedence list against the tests one line at a time.
- `RequestOutcome` is exported and now has a required field. `resolveSampling` is documented as unstable, so this is a minor.
