# Plan 156: An invalid glob in `logFilter.accessLine` or `sampling.tail.paths` is rejected with the option's name

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/src/config/resolve-options.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

Config mistakes are reported at startup with a message that names the option: `logixlysia: invalid logFilter config — exclude: '/a/**/**/x' — Invalid glob pattern: …`. Two glob lists skip that check. A bad glob in `logFilter.accessLine.include`/`exclude` or in `sampling.tail.paths` still stops the app, but later and with a bare `Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues`, which says neither which package threw nor which of the four glob lists is wrong.

## Current state

`packages/logixlysia/src/config/resolve-options.ts`.

`validateTailSampling` (lines 78-96) checks only that `tail.paths` is an array of non-empty strings:

```ts
if (tail?.paths !== undefined) {
  if (!Array.isArray(tail.paths)) {
    invalidSampling('tail.paths must be an array')
  }
  if (tail.paths.some(path => typeof path !== 'string' || path.length === 0)) {
    invalidSampling('tail.paths must contain non-empty glob strings')
  }
}
```

`validateAccessLineGlobs` (lines 182-191) does the same for the access-line lists:

```ts
const validateAccessLineGlobs = (accessLine: LogFilter['accessLine']): void => {
  for (const key of ['include', 'exclude'] as const) {
    const globs: unknown = accessLine?.[key]
    if (globs !== undefined && !isGlobList(globs)) {
      invalidLogFilter(
        `accessLine.${key} must be an array of non-empty glob strings`
      )
    }
  }
}
```

`validateLogFilterPaths` (lines 193-211) is the pattern to copy; it compiles each glob:

```ts
for (const glob of logFilter[key] ?? []) {
  try {
    globToRegExp(glob)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    invalidLogFilter(`${key}: '${glob}' — ${message}`)
  }
}
```

`invalidSampling(detail)` throws `logixlysia: invalid sampling config — <detail>`; `invalidLogFilter(detail)` throws `logixlysia: invalid logFilter config — <detail>`.

Observed at `be8daf5`:

| Config | Thrown message |
| --- | --- |
| `logFilter: { exclude: ['/a/**/**/x'] }` | `logixlysia: invalid logFilter config — exclude: '/a/**/**/x' — Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues` |
| `logFilter: { accessLine: { exclude: ['/a/**/**/x'] } }` | `Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues` |
| `sampling: { head: { INFO: 0 }, tail: { paths: ['/a/**/**/x'] } }` | `Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues` |

## Design (decided)

Extract the try/compile/rethrow loop of `validateLogFilterPaths` into one local helper, for example `checkGlobs(globs, label, invalid)`, and call it from all three validators. Messages:

- `logixlysia: invalid logFilter config — accessLine.exclude: '<glob>' — <glob error>` (and `accessLine.include`)
- `logixlysia: invalid sampling config — tail.paths: '<glob>' — <glob error>`
- the existing `include` / `exclude` messages stay byte-identical.

## Scope

**In scope**:

- `packages/logixlysia/src/config/resolve-options.ts`
- `packages/logixlysia/__tests__/config/resolve-options.test.ts`
- `.changeset/glob-errors-name-the-option.md` (create)

**Out of scope**:

- `packages/logixlysia/src/sampling/glob.ts` (the glob rules and their messages).
- `src/sampling/access-line.ts` and `src/sampling/index.ts`: they keep compiling the globs they use.

## Commands you will need

Run everything from the repository root unless a row says otherwise. The shell may export `FORCE_COLOR` and `NO_COLOR` together, which makes unrelated color tests fail, so every command below clears both.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install (fresh worktree only) | `bun install --frozen-lockfile` | exit 0 |
| Lint + format check | `env -u FORCE_COLOR -u NO_COLOR bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 |
| Typecheck | `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` | exit 0 |
| Build the package | `cd packages/logixlysia && bun run build` | exit 0 |
| One test file | `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test <path>` | all pass |
| Full package suite | `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` | 0 fail (1517 pass at `be8daf5`; the API snapshot test needs `dist/`) |

Bun is 1.3.14. Tests use `bun:test`. Do not add dependencies.

## Repo conventions that apply

- Lint is Ultracite (Oxlint + Oxfmt), strict. Arrow functions, `const`, `for...of`, no `any`, no `console.log` in source, no nested ternaries, top-level regex literals. Run `bun run format` before you commit, then `bun run lint`.
- Comments: keep a comment only for a non-obvious _why_. Do not narrate what the code does, and do not delete existing comments you did not make obsolete.
- Tests live in `packages/logixlysia/__tests__/<area>/*.test.ts`, import from `../../src`, and assert on behaviour through the public API with literal expected values. Helpers are in `packages/logixlysia/__tests__/_helpers/` (`sleep.ts`, `tmp.ts`, `console.ts`).
- Any change under `packages/logixlysia/` needs a changeset: a new file `.changeset/<slug>.md` with front matter `'logixlysia': patch` (or `minor`) and one paragraph, written for a user of the package, that says what was wrong or missing and what happens now. Exemplar (`.changeset/file-sink-close-race.md`):

  ```md
  ---
  'logixlysia': patch
  ---

  A log line written while `flushLogixlysia(options, { close: true })` was running could reopen the log file while its sink was still registered, ... Such a line now keeps its sink registered, and the next close releases the descriptor.
  ```

- Docs prose (`apps/docs/content/**/*.mdx`, changesets, PR text): short declarative sentences, no long dashes, say what the software does. Never name any other logging library outside `apps/docs/content/comparison.mdx` and `apps/docs/content/migration-from-evlog.mdx`.

## Git workflow

- Branch: `fix/glob-errors-name-the-option`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `fix(config): stop a mistyped transport minLevel from receiving every level (#641)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: Failing tests

In `__tests__/config/resolve-options.test.ts`, find how the existing tests trigger a `logFilter` or `sampling` validation error (search the file for `invalid logFilter config`), and add, in the same style:

1. `logFilter: { accessLine: { exclude: ['/a/**/**/x'] } }` throws a message that starts with `logixlysia: invalid logFilter config — accessLine.exclude: '/a/**/**/x' — Invalid glob pattern`.
2. The same for `accessLine.include`.
3. `sampling: { head: { INFO: 0 }, tail: { paths: ['/a/**/**/x'] } }` throws a message that starts with `logixlysia: invalid sampling config — tail.paths: '/a/**/**/x' — Invalid glob pattern`.
4. A glob with three single wildcards in one segment (`'/a/*b*c*'`) in `tail.paths` is rejected the same way.
5. Valid globs in all three places do not throw.

**Verify**: `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test __tests__/config/resolve-options.test.ts` → tests 1–4 fail (the message lacks the prefix), 5 passes.

### Step 2: Implement

**Verify**: the same command → 0 fail.

### Step 3: Changeset, lint, full suite

`.changeset/glob-errors-name-the-option.md`, `'logixlysia': patch`: an invalid glob in `logFilter.accessLine` or `sampling.tail.paths` is now rejected with the option's name, like `logFilter.include` and `exclude`.

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0; `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0; `cd packages/logixlysia && bun run build && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail.

## Test plan

The five tests in step 1.

## Done criteria

- [ ] The five new tests pass
- [ ] Full package suite → 0 fail; lint and typecheck exit 0
- [ ] `.changeset/glob-errors-name-the-option.md` exists with `'logixlysia': patch`
- [ ] `git diff --stat origin/main` lists only the three in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- An existing test expects the bare `Invalid glob pattern` message for one of these options.

## Maintenance notes

- A fifth glob option must call the same helper.
