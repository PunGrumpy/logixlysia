# Plan 074: One file sink per real path, and a failed size rotation is retried after another `maxSize`, not on every batch

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. Do not update `plans/README.md`; your reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 5115bea..HEAD -- packages/logixlysia/src/output/file-sink.ts packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts` must print nothing. If the excerpts under "Current state" do not match the live file, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5115bea`, 2026-10-30

## Why this matters

The file sink registry is keyed by the raw `logFilePath` string. `./logs/app.log`, `logs/app.log` and the absolute path to the same file get three sinks with three handles and three byte counters. When one rotates, it renames the file out from under the others, which keep appending to the archived inode. Apps that mount more than one plugin instance, or pass the path through different config layers, hit this.

Separately, when a size rotation fails (for example `rename` is denied), the sink has already dropped its handle and reset its byte count, so the next batch reopens the file, reads its size, finds it still over `maxSize`, and rotates again. Every batch pays a close, open, stat and failed rename, and `onError` is called once per batch with no throttle. Interval rotation does not flood, because a failed attempt still moves `openedAt` forward by one interval. The size path should back off the same way: after a failure, try again only once another `maxSize` of bytes has been written.

## Current state

`packages/logixlysia/src/output/file-sink.ts` (216 lines). Relevant parts:

```ts
const sinks = new Map<string, FileSink>()                 // :45

class FileSinkImpl implements FileSink {
  private readonly filePath: string
  private handle: FileHandle | null = null
  private bytesWritten = 0
  private openedAt = 0
  ...
  constructor(filePath: string) {                          // :59
    this.filePath = filePath
  }
```

```ts
  private async ensureOpen(options: FileSinkOptions): Promise<void> {   // :122-133
    if (this.handle) {
      return
    }

    await ensureDir(path.dirname(this.filePath), options.logDirMode)
    const handle = await open(this.filePath, 'a', options.logFileMode ?? 0o600)
    const stat = await handle.stat()
    this.handle = handle
    this.bytesWritten = stat.size
    this.openedAt = resolveOpenedAt(stat.birthtimeMs, Date.now())
  }

  private shouldRotateNow(rotation: LogRotationConfig): boolean {        // :135-146
    if (
      rotation.maxSize !== undefined &&
      this.bytesWritten > parseSize(rotation.maxSize)
    ) {
      return true
    }
    return (
      rotation.interval !== undefined &&
      Date.now() - this.openedAt >= parseInterval(rotation.interval)
    )
  }

  private async maybeRotate(options: FileSinkOptions): Promise<void> {   // :148-183
    const rotation = options.logRotation
    if (
      !rotation ||
      (rotation.maxSize === undefined && rotation.interval === undefined)
    ) {
      return
    }

    try {
      if (!this.shouldRotateNow(rotation)) {
        return
      }

      const { handle } = this
      this.handle = null
      this.bytesWritten = 0
      this.openedAt = Date.now()
      await handle?.close()
      await performRotation(
        this.filePath,
        rotation,
        options.onRotationError,
        options.logFileMode
      )
    } catch (error) {
      if (options.onRotationError) {
        options.onRotationError(error)
      } else {
        console.error(
          `[logixlysia] Failed to rotate log file ${this.filePath}:`,
          error
        )
      }
    }
  }
```

```ts
  async close(): Promise<void> {                           // :192-198
    await this.flush()
    const { handle } = this
    this.handle = null
    await handle?.close()
    sinks.delete(this.filePath)
  }
}

export const getFileSink = (filePath: string): FileSink => {   // :201-208
  let sink = sinks.get(filePath)
  if (!sink) {
    sink = new FileSinkImpl(filePath)
    sinks.set(filePath, sink)
  }
  return sink
}
```

`performRotation` (`src/output/rotation-manager.ts`) renames the file to a timestamped archive via `fs.rename`, then compresses and prunes. A denied `rename` throws out of `performRotation` into the `catch` above. Do not edit `rotation-manager.ts`.

Tests: `packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts` uses `getFileSink`, `flushAllFileSinks`, `createTempDir`/`removeTempDir` from `../_helpers/tmp` and `readFile`. Its tests are short `try { ... } finally { await removeTempDir(dir) }` blocks; copy that shape. `__tests__/output/race-condition.test.ts` and `rotation-manager.test.ts` cover rotation itself; leave them.

## Commands you will need

Run from the worktree root unless the row says otherwise. A fresh worktree has no `node_modules`; install first.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exit 0, lockfile unchanged (`git status --short bun.lock` prints nothing) |
| Lint and format check | `bun run lint` | exit 0 |
| Auto-format | `bun run format` | exit 0 (run before every commit) |
| Typecheck | `bun run typecheck` | exit 0 |
| Tests (package) | `cd packages/logixlysia && bun test` | `0 fail`; 723 tests pass at the planned-at commit, plus the ones this plan adds |
| One test file | `cd packages/logixlysia && bun test __tests__/<area>/<file>.test.ts` | `0 fail` |
| Build | `bun run build` | exit 0, `packages/logixlysia/dist/` has 14 entries |

Notes that save time:

- `turbo` (used by `bun run typecheck`, `bun run build`, `bun run test` at the root) appends an "agent rules" block to `AGENTS.md` when it runs. Never commit that block. After any turbo run, `git checkout -- AGENTS.md` unless this plan tells you to edit `AGENTS.md` (then revert only the appended block).
- Lint is Ultracite (oxlint + oxfmt) with strict rules. Never add a disable comment, an ignore entry, or loosen a rule. Restructure the code until it passes. `bun run format` fixes formatting only.
- Tests use `bun:test` (`describe`, `test`, `expect`). Assert what a caller observes (a returned value, a written line, a transport call, a thrown error), not internals. Derive the expected value from the requirement, not from running the code.
- Comments: write none that narrate the code or the step. Keep a comment only for a non-obvious reason the code cannot show.

## Git workflow

- Start from commit `5115bea` (`origin/main`). In your worktree: `git checkout -B improve/<NNN>-<slug> 5115bea`. Do not branch from the worktree's initial HEAD, which is an unrelated docs branch.
- Conventional Commits, one commit per logical unit, in the order the steps are listed: `fix(<area>): <imperative subject>`, body explains why in two to four plain sentences. No `Co-Authored-By` or any attribution trailer. No "Generated with" line.
- Commit with signing off, per command: `git -c commit.gpgsign=false commit -m ...`. The session cannot reach the repository's signer.
- Every change under `packages/logixlysia/` needs a changeset unless this plan says otherwise: `.changeset/<slug>.md` containing

  ```
  ---
  'logixlysia': patch
  ---

  <one or two sentences, user-facing, past tense: what was wrong and what the user sees now>
  ```

  Commit the changeset together with the fix it describes.

- Do not push, do not open a PR, do not touch `plans/`. Your reviewer maintains the index and does the delivery.

## Scope

**In scope** (the only files you may modify):

- `packages/logixlysia/src/output/file-sink.ts`
- `packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts`
- `.changeset/file-sink-path-key-and-rotation-backoff.md` (create)

**Out of scope**: `src/output/rotation-manager.ts`, `src/output/file.ts` (plan 075 edits it this round), the `onRotationError` fallback to `console.error` (a separate consolidation, see the backlog), compression running inside the write chain (backlog), `__tests__/output/file.test.ts`, `race-condition.test.ts`, `interval-rotation.test.ts` (plan 075 edits them).

## Steps

### Step 1: Key sinks by the resolved path

In `getFileSink`, resolve once: `const resolved = path.resolve(filePath)`, look up and store under `resolved`, and construct `new FileSinkImpl(resolved)`. `close()` already deletes `this.filePath`, which is now the resolved path. `path` is already imported.

Test: in a temp dir, `const abs = path.join(dir, 'logs', 'same.log')` and `const rel = path.relative(process.cwd(), abs)`; assert `getFileSink(abs) === getFileSink(rel)`, then write one line through each reference, flush, and assert the file contains both lines exactly once each. Close the sink in `finally` before removing the dir.

**Verify**: `cd packages/logixlysia && bun test __tests__/output/file-sink-lifecycle.test.ts` → `0 fail`.

Commit: `fix(output): share one file sink per resolved log path`.

### Step 2: Back off after a failed size rotation

Add a private boolean `rotationFailed = false` to `FileSinkImpl`. In `maybeRotate`'s `catch`, set it to `true` before reporting. In `ensureOpen`, after `stat`, set `this.bytesWritten = this.rotationFailed ? 0 : stat.size` and reset `this.rotationFailed = false`. Result: after a failure the counter restarts from zero, so the next attempt comes after another `maxSize` of new writes, mirroring how `openedAt = Date.now()` already spaces out interval retries. A successful rotation path is unchanged.

Test: in a temp dir, create `logs/flood.log`, pre-fill it with 2 KB, set `logRotation: { maxSize: '1k' }` and an `onRotationError` mock. Make `rename` fail by making the `logs` directory read-only with `chmod(dir, 0o500)` after the file exists (the sink can still append to an existing file it opens; `rename` needs write permission on the directory). Write five one-byte lines, awaiting each. Assert `onRotationError` was called exactly once. Restore `chmod(dir, 0o700)` in `finally` before `removeTempDir`. Guard the test with `test.skipIf(process.getuid?.() === 0)`, because root ignores directory permissions. Also assert the happy path still rotates: a second test (or the existing rotation tests) is enough if one already rotates by size; if none in this file does, add one that writes past `maxSize` into a writable dir and asserts a rotated sibling file exists.

If `chmod` does not make `rename` fail on your filesystem (check by running the test before the fix: it must report five calls), STOP and report the platform.

**Verify**: `cd packages/logixlysia && bun test __tests__/output/file-sink-lifecycle.test.ts` → `0 fail`. Before the fix (stash it once), the new test must fail with 5 calls instead of 1; mention the observed count in your report.

Commit: `fix(output): retry a failed size rotation after another maxSize, not every batch`.

### Step 3: Changeset, full gates

Create `.changeset/file-sink-path-key-and-rotation-backoff.md` (`'logixlysia': patch`): relative and absolute spellings of the same `logFilePath` now share one file sink, so rotation by one cannot strand the other; after a failed size rotation the sink waits for another `maxSize` of writes before trying again instead of retrying and reporting on every batch.

**Verify**: `bun run format && bun run lint && bun run typecheck && (cd packages/logixlysia && bun test)` → all exit 0, `0 fail`.

## Test plan

Two or three new tests in `__tests__/output/file-sink-lifecycle.test.ts` as described. They assert through `getFileSink`, the file contents and the `onRotationError` hook, which are what the library's callers observe.

## Done criteria

- [ ] `bun run lint`, `bun run typecheck` exit 0
- [ ] `cd packages/logixlysia && bun test` → `0 fail`, at least 725 tests
- [ ] `grep -c "path.resolve" packages/logixlysia/src/output/file-sink.ts` → `1`
- [ ] `grep -c "rotationFailed" packages/logixlysia/src/output/file-sink.ts` → `3` or more
- [ ] `git diff --stat 5115bea..HEAD` lists only the three in-scope paths

## STOP conditions

- The excerpts do not match the live file.
- The read-only directory does not make `rename` fail on this machine (report; do not mock `fs`).
- Any existing test in `__tests__/output` starts failing after Step 1 (a test may rely on two spellings being distinct sinks; report which).
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- `closeAllFileSinks`/`flushAllFileSinks` iterate the registry; keys are now absolute, which also makes a `process.chdir()` after startup harmless for already-opened sinks.
- Reviewer: confirm `rotationFailed` is reset on reopen so a later success is not affected, and that the interval path is untouched.
- Deferred to the backlog: streaming compression off the write chain, and consolidating the five `onError`/`console.error` reporter copies.
