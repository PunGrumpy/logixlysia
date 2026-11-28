# 163: Make the root coverage task build first and restore its report

Status: DONE - [PR #683](https://github.com/PunGrumpy/logixlysia/pull/683), squash `c290ece1` on `main`.

P2 | developer tooling | S | low risk | independent | planned at `ab502d19`, 2026-11-27.

## Current state

`package.json:22` runs `turbo test:coverage`; `packages/logixlysia/package.json:125` runs `bun test --coverage --coverage-reporter=lcov`. In `turbo.json:29-36` the ordinary test depends on `"build"` but coverage only on `"^test:coverage"` (coverage in dependency packages). No output is declared. The API snapshot checks for `dist/index.js` and throws in CI or skips the runtime surface test locally when absent (`packages/logixlysia/__tests__/api/surface.test.ts:8-15,61-67`). Turbo cannot restore an undeclared `coverage/lcov.info`.

## Scope and drift

Only `turbo.json`; no package changeset. Use isolated branch `fix/coverage-task-artifacts` from `ab502d19`; `git diff --stat ab502d19..HEAD -- turbo.json` should be empty. Preserve ordinary tests, thresholds, lockfile, workflows, package scripts and all other tasks. Match the same-package build dependency in `tasks.test` and package-relative output glob in `tasks.build`.

## Steps and proof

1. Fresh isolated checkout, Bun 1.3.14: `bun install --frozen-lockfile` (0). Run the following graph assertion from root before editing (expect exit 1 on base), then after step 2 (expect 0):

   ```sh
   bun x --no-install turbo run test:coverage --filter=logixlysia --dry=json | bun -e 'const g=await Bun.stdin.json(); const t=g.tasks.find(x=>x.taskId==="logixlysia#test:coverage"); process.exit(t?.dependencies.includes("logixlysia#build") && t.outputs?.includes("coverage/lcov.info") ? 0 : 1)'
   ```

2. Change only `tasks["test:coverage"]` to `{ "dependsOn": ["^test:coverage", "build"], "outputs": ["coverage/lcov.info"] }`. No CI job or test changes. Re-run the assertion.
3. In the new worktree run the following **before** other gates produce `dist`. Use a private empty local Turbo cache (`mktemp -d`), with no remote writes. Preserve the report produced by this run; never remove pre-existing files. Both invocations must exit 0. The first must build before testing, the second must hit cache for coverage, and the restored report must compare byte-for-byte:

   ```sh
   proof=$(mktemp -d)
   test ! -e packages/logixlysia/dist/index.js
   CI=true bun run test:coverage --filter=logixlysia --cache=local:rw --cache-dir="$proof/cache"
   test -s packages/logixlysia/coverage/lcov.info
   mv packages/logixlysia/coverage/lcov.info "$proof/first.lcov"
   CI=true bun run test:coverage --filter=logixlysia --cache=local:rw --cache-dir="$proof/cache"
   cmp "$proof/first.lcov" packages/logixlysia/coverage/lcov.info
   ```

4. From root `git diff --check`, `bun run lint`, `bun run typecheck`, `bun run build`, `(cd packages/logixlysia && bun run build && CI=true bun test)` must exit 0. One atomic commit (`fix(tooling): build before coverage and cache the LCOV report`), no attribution. No push, PR, index edits or merge by executor.

Stop on unexpected pre-existing outputs (do not delete them), incompatible drift, a gate failing twice, or if Bun writes a different artifact. Report actual graph test, cold run, cache hit, comparison, SHA and worktree. If the reporter or report directory changes in future, update its declared output in the same change.
