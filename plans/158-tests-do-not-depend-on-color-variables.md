# Plan 158: The test suite passes whatever `FORCE_COLOR` and `NO_COLOR` the shell exports

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat be8daf5..HEAD -- packages/logixlysia/bunfig.toml packages/logixlysia/__tests__` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `be8daf5`, 2026-11-26

## Why this matters

`cd packages/logixlysia && bun test` fails 27 tests in a shell that exports both `FORCE_COLOR` and `NO_COLOR`, which is what several agent and CI shells do. The failures are in color assertions and in tests that spawn a child process, and they have nothing to do with the change under test. Every contributor and every automated run in such a shell has to know to unset the two variables. CI is green only because its environment sets neither.

## Current state

- `packages/logixlysia/bunfig.toml`:

```toml
[test]
coverage = true
# Build config that the API-surface test imports, not library code. ...
coveragePathIgnorePatterns = ["bunup.config.ts", "__tests__/_helpers/**"]
coverageSkipTestFiles = true
coverageThreshold = { lines = 0.80, functions = 0.70 }
```

- `packages/logixlysia/src/utils/color.ts` reads `process.env.NO_COLOR` and `process.stdout.isTTY`; `chalk` reads `FORCE_COLOR` and `NO_COLOR` when it is first imported.
- Tests that set the variables themselves and restore them: `__tests__/logger/level-word.test.ts` (saves `process.env.NO_COLOR`, deletes or sets it per test, restores it) and `__tests__/logger/lazy-chalk.test.ts` (builds an explicit `env` for its child process).
- Tests that inherit the shell's variables: `__tests__/logger/colors.test.ts`, and the child-process tests `__tests__/logger/bundled-app.test.ts`, `__tests__/logger/commonjs-bundle.test.ts`, `__tests__/api/errors-subpath.test.ts` (they call `spawnSync([...], { cwd })`, so the child gets `process.env`).

Reproduce: `cd packages/logixlysia && bun run build && FORCE_COLOR=1 NO_COLOR=1 bun test 2>&1 | tail -5` → 27 fail at `be8daf5` (the count may differ slightly; it is not 0).

## Design (decided)

One preload file removes both variables from `process.env` before any test file or library module loads, so the process and every child it spawns start from the same clean state.

- Create `packages/logixlysia/__tests__/_helpers/clean-env.ts`:

```ts
// A shell that exports these changes what chalk and the color checks decide,
// in this process and in every child a test spawns.
delete process.env.FORCE_COLOR
delete process.env.NO_COLOR
```

- Add `preload = ["./__tests__/_helpers/clean-env.ts"]` under `[test]` in `packages/logixlysia/bunfig.toml`.
- Do not edit the test files unless one still fails under the reproduce command after the preload is in place; then fix that file in the smallest way (pass an explicit `env` to its `spawnSync`, the way `lazy-chalk.test.ts` does).

## Scope

**In scope**:

- `packages/logixlysia/bunfig.toml`
- `packages/logixlysia/__tests__/_helpers/clean-env.ts` (create)
- A test file that still fails under the reproduce command (smallest fix only)
- `AGENTS.md` (only if it tells the reader to unset the variables; it does not at `be8daf5`)
- `.changeset/tests-ignore-color-variables.md` (create; the repo's rule is a changeset for any change under `packages/logixlysia/`, see `.changeset/child-process-test-timeouts.md` for a test-only one)

**Out of scope**:

- `packages/logixlysia/src/**`. The library's handling of the variables is correct and tested.
- The root `bunfig.toml`.

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
| Reproduce | `cd packages/logixlysia && bun run build && FORCE_COLOR=1 NO_COLOR=1 bun test 2>&1 \| tail -5` | 0 fail after this plan |

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

- Branch: `test/color-variables-do-not-leak`, cut from `origin/main`.
- Atomic commits, one logical unit each (for example: the fix with its tests, then the docs, then the changeset). Conventional commits with a body that says why. Example from `git log`: `test: give tests that start a child process their own timeout (#654)`.
- **No attribution of any kind**: no `Co-Authored-By`, no `Generated with`, no tool or model names in commit messages, the changeset, code comments, or the PR text.
- Commits are signed by the repository's git config. Do not change git config and do not pass `--no-gpg-sign`.
- Do NOT push or open a PR unless the operator who dispatched you told you to.

## Steps

### Step 1: See it fail

**Verify**: the reproduce command → a non-zero fail count. Write the number down for the PR.

### Step 2: Add the preload

**Verify**:

- the reproduce command → 0 fail
- `cd packages/logixlysia && FORCE_COLOR=1 bun test 2>&1 | tail -5` → 0 fail
- `cd packages/logixlysia && NO_COLOR=1 bun test 2>&1 | tail -5` → 0 fail
- `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test 2>&1 | tail -5` → 0 fail, and the pass count equals the count before the change
- the coverage threshold line still passes (the helper is under `__tests__/_helpers/**`, which coverage ignores)

### Step 3: Changeset and lint

`.changeset/tests-ignore-color-variables.md`, `'logixlysia': patch`: "The package's tests no longer depend on `FORCE_COLOR` or `NO_COLOR` being unset in the shell that runs them. Nothing changes for users of the package."

**Verify**: `bun run format && env -u FORCE_COLOR -u NO_COLOR bun run lint` → exit 0. `env -u FORCE_COLOR -u NO_COLOR bun run typecheck` → exit 0.

## Test plan

No new test: the four commands in step 2 are the proof, and their output goes into the PR.

## Done criteria

- [ ] `cd packages/logixlysia && FORCE_COLOR=1 NO_COLOR=1 bun test` → 0 fail
- [ ] `cd packages/logixlysia && env -u FORCE_COLOR -u NO_COLOR bun test` → 0 fail, same pass count as before
- [ ] lint and typecheck exit 0
- [ ] `git diff --stat origin/main` lists only in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts (the codebase drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- `bun test` does not run the preload (the reproduce command still fails with the same count): check the path is relative to `packages/logixlysia/`, then stop and report.
- A test that deliberately asserts on the shell's own `NO_COLOR` breaks.

## Maintenance notes

- A new test that needs one of the variables sets it itself and restores it, as `level-word.test.ts` does.
- `bun run test` from the repository root runs through Turborepo with the package's own `bunfig.toml`, so CI picks the preload up with no workflow change.
