# Plan 145: A log write that races `flushLogixlysia(options, { close: true })` leaves no descriptor that a later close cannot release

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. Do not improvise. Skip any instruction to update `plans/README.md`: the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/output/file-sink.ts packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts` If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

`flushLogixlysia(options, { close: true })` is how a worker, a script or a custom signal handler releases the plugin's log file before it exits. When a request writes a line while that close runs, the line is written, but the file sink reopens the file after the close has released it and is then taken out of the sink registry. Nothing can reach that sink any more, so its descriptor stays open for the life of the process: a second `flushLogixlysia(options, { close: true })` does not release it, and garbage collection does not either.

Measured at `c019a4f` on Bun 1.3.14, with one request sent per `setImmediate` while `flushLogixlysia(options, { close: true })` runs, then `lsof` counting the process's descriptors on the log file (three runs, same result each time):

```
fds on app.log after close: 1
fds on app.log after a second close: 1 lines now: 3 sent 3
```

With the fix applied to a copy of the source, the same probe prints:

```
fds on app.log after close: 1
fds on app.log after a second close: 0 lines now: 3 sent 3
```

After this plan, a write issued while a close runs goes to a sink that is in the registry, so the next close finds it and releases its descriptor. No line is lost before or after the change. Closing a sink object a second time also stops taking a newer sink for the same path out of the registry, which today leaks that newer sink's descriptor the same way.

## Current state

All source paths are relative to `packages/logixlysia/`.

`src/output/file-sink.ts` owns one `FileSinkImpl` per resolved log file path, kept in a module-level registry:

```ts
// src/output/file-sink.ts:45
const sinks = new Map<string, FileSink>()
```

```ts
// src/output/file-sink.ts:204-220
export const getFileSink = (filePath: string): FileSink => {
  const resolved = path.resolve(filePath)
  let sink = sinks.get(resolved)
  if (!sink) {
    sink = new FileSinkImpl(resolved)
    sinks.set(resolved, sink)
  }
  return sink
}

export const flushAllFileSinks = async (): Promise<void> => {
  await Promise.allSettled([...sinks.values()].map(sink => sink.flush()))
}

export const closeAllFileSinks = async (): Promise<void> => {
  await Promise.allSettled([...sinks.values()].map(sink => sink.close()))
}
```

`write()` collects the lines of one microtask into a batch, then chains the batch onto `flushChain` from a queued microtask (`src/output/file-sink.ts:64-90`). Each batch opens the file when the sink has no handle:

```ts
// src/output/file-sink.ts:123-135
  private async ensureOpen(options: FileSinkOptions): Promise<void> {
    if (this.handle) {
      return
    }

    await ensureDir(path.dirname(this.filePath), options.logDirMode)
    const handle = await open(this.filePath, 'a', options.logFileMode ?? 0o600)
    const stat = await handle.stat()
    this.handle = handle
    this.bytesWritten = this.rotationFailed ? 0 : stat.size
    this.rotationFailed = false
    this.openedAt = resolveOpenedAt(stat.birthtimeMs, Date.now())
  }
```

The fault is in `close()`:

```ts
// src/output/file-sink.ts:188-201
  async flush(): Promise<void> {
    // write() chains onto flushChain from a microtask, so yield once before
    // reading the chain or a write issued in the same tick would be missed.
    await Promise.resolve()
    await this.flushChain
  }

  async close(): Promise<void> {
    await this.flush()
    const { handle } = this
    this.handle = null
    await handle?.close()
    sinks.delete(this.filePath)
  }
```

`close()` waits for the batches chained so far, clears the handle, waits for the handle to close, and only then removes the sink from the registry. Until that last line, `getFileSink` keeps handing out the closing sink. A write that reaches it after `flush()` read `flushChain` is chained behind the close, finds `handle === null`, opens a new handle, and is then orphaned by `sinks.delete`. The same `sinks.delete` also runs when a sink object that was already closed is closed again, and by then the registry may hold a newer sink for that path: that newer sink is removed while its file is open.

The plugin's only writer, `src/output/file.ts:67-73`, looks the sink up for every line, in the same expression as the write:

```ts
await getFileSink(filePath).write(line, {
  logDirMode: config?.logDirMode,
  logFileMode: config?.logFileMode,
  logRotation: config?.logRotation,
  onRotationError
})
```

So once the closing sink is out of the registry, every later line goes to a new sink that a later `closeAllFileSinks()` reaches. The other callers of the registry are `flushAllFileSinks` (from `src/output/shutdown.ts`, used by `onStop` and the flush part of `flushLogixlysia`) and `closeAllFileSinks` (from `flushLogixlysia` in `src/index.ts:937-945`). Neither is changed. `getFileSink` and `FileSinkImpl` are not exported from the package.

The existing tests of the sink's life cycle are in `__tests__/output/file-sink-lifecycle.test.ts`. Its imports today (lines 1 to 6):

```ts
import { describe, expect, mock, test } from 'bun:test'
import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { flushAllFileSinks, getFileSink } from '../../src/output/file-sink'
import type { FileSink, FileSinkOptions } from '../../src/output/file-sink'
import { createTempDir, removeTempDir } from '../_helpers/tmp'
```

It already pins two behaviours this plan must keep: `close() releases the handle and a later write reopens the file` (a write through `getFileSink` after a close gets a new sink and both lines reach the file) and `close() is idempotent` (line 59).

How the tests observe an open descriptor, without `lsof` or `/dev/fd`: on Bun 1.3.14 a `FileHandle` reports `fd === -1` once it is closed, and `spyOn(FileHandle.prototype, 'write')` sees every write the sink makes through any handle (checked in a scratch copy). The tests record each handle the sink writes through and, after the last close, expect none of them to have an fd other than `-1`.

How the tests pin the race without luck: `close()` is called and not awaited, and the next statement issues the write through `getFileSink`. `flush()` yields once before it reads `flushChain`, and that yield is queued before the write's own microtask, so the write is always outside the batches `close()` waits for. On the unpatched code this fails the same way on every run (three of three in the scratch copy).

Conventions to match:

- Tests use `bun:test`, a temp directory from `__tests__/_helpers/tmp.ts`, and a `try`/`finally` that removes it. Helpers used by one file sit at the top of that file, as `writeSequentially` does.
- Comments say why, never what.
- `oxlint` requires a named function expression (`func-names`).

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` (root) | exit 0 |
| Build | `cd packages/logixlysia && bun run build` | `Build completed` |
| Lint | `bun run lint` (root) | exit 0 |
| Format | `bun run format` (root) | exit 0; read the diff it makes |
| Typecheck | `cd packages/logixlysia && bun run typecheck` | exit 0 |
| One test file | `cd packages/logixlysia && bun test ./__tests__/output/file-sink-lifecycle.test.ts` | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite | `cd packages/logixlysia && bun test` | 0 fail (1249 tests at `c019a4f`, 1251 after this plan) |

On a heavily loaded machine the tests in this file can pass Bun's 5 second default because removing a temp directory is slow. If a test fails with a timeout and no assertion message, run the file again with `--timeout 60000` and judge by that run.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/output/file-sink.ts` (the `close()` method only)
- `packages/logixlysia/__tests__/output/file-sink-lifecycle.test.ts`
- `.changeset/file-sink-close-race.md` (create)

**Out of scope** (do NOT touch):

- `packages/logixlysia/src/output/index.ts`, `packages/logixlysia/src/output/shutdown.ts`, and the `flushLogixlysia` and `onStop` parts of `packages/logixlysia/src/index.ts`. Another pull request is editing them, and the fix does not need them.
- `write()`, `flush()`, `flushBatch()`, `ensureOpen()`, the rotation methods, `getFileSink`, `flushAllFileSinks` and `closeAllFileSinks` in `file-sink.ts`. Plan 146 changes the rotation methods next; keep this change inside `close()` so the two do not overlap.
- A write made through a sink object kept from before its close (`const sink = getFileSink(p); await sink.close(); sink.write(…)`). No caller in the package does that, and it stays as it is. See "Maintenance notes".
- Docs pages, the API snapshot, and any new option or export.

## Git workflow

- Branch: `fix/file-sink-close-race`, cut from the base commit your task names.
- Two commits, in this order:
  1. `fix(output): unregister a file sink before its close waits on writes` (`file-sink.ts` and the test file; it turns the two new tests green)
  2. `chore(changeset): note the file sink close fix`
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Write the failing tests

In `__tests__/output/file-sink-lifecycle.test.ts`, replace the import block (lines 1 to 6) with:

```ts
import { describe, expect, mock, spyOn, test } from 'bun:test'
import type { FileHandle } from 'node:fs/promises'
import {
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import {
  closeAllFileSinks,
  flushAllFileSinks,
  getFileSink
} from '../../src/output/file-sink'
import type { FileSink, FileSinkOptions } from '../../src/output/file-sink'
import { createTempDir, removeTempDir } from '../_helpers/tmp'
```

Directly after `writeSequentially` and before `describe('file sink lifecycle', …)`, add the handle tracker:

```ts
interface HandleTracker {
  openDescriptors: () => number[]
  restore: () => void
}

// Records every FileHandle the sink writes through. A closed FileHandle
// reports fd -1, so any other fd is a descriptor still open.
const trackWrittenHandles = async (dir: string): Promise<HandleTracker> => {
  const probe = await open(path.join(dir, 'probe'), 'a')
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  await probe.close()
  const originalWrite = prototype.write
  const handles = new Set<FileHandle>()
  const spy = spyOn(prototype, 'write').mockImplementation(
    function recordHandle(this: FileHandle, ...args: unknown[]) {
      handles.add(this)
      return Reflect.apply(originalWrite, this, args)
    } as FileHandle['write']
  )
  return {
    openDescriptors: () =>
      [...handles].map(handle => handle.fd).filter(fd => fd !== -1),
    restore: () => spy.mockRestore()
  }
}
```

Inside the `describe` block, directly before `test('close() is idempotent', …)`, add two tests:

```ts
test('a write issued while close() runs is released by the next close', async () => {
  const dir = await createTempDir()
  const tracker = await trackWrittenHandles(dir)
  try {
    const filePath = path.join(dir, 'logs', 'close-race.log')
    const sink = getFileSink(filePath)
    await sink.write('before-close\n', {})

    const closing = sink.close()
    const late = getFileSink(filePath).write('during-close\n', {})
    await closing
    await late
    await closeAllFileSinks()

    expect(tracker.openDescriptors()).toEqual([])
    expect(await readFile(filePath, 'utf-8')).toBe(
      'before-close\nduring-close\n'
    )
  } finally {
    tracker.restore()
    await closeAllFileSinks()
    await removeTempDir(dir)
  }
})

test('closing a sink again leaves the sink now registered for its path', async () => {
  const dir = await createTempDir()
  try {
    const filePath = path.join(dir, 'logs', 'close-twice.log')
    const first = getFileSink(filePath)
    await first.write('first\n', {})
    await first.close()

    const second = getFileSink(filePath)
    await second.write('second\n', {})
    await first.close()

    expect(getFileSink(filePath)).toBe(second)
  } finally {
    await closeAllFileSinks()
    await removeTempDir(dir)
  }
})
```

The `late` write is issued in the statement right after `sink.close()` and before anything is awaited. Keep it that way: that ordering is what puts the write outside the batches `close()` waits for.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/output/file-sink-lifecycle.test.ts` reports 7 pass and 2 fail. The failures are the two new tests:

- `a write issued while close() runs is released by the next close` fails on `expect(tracker.openDescriptors()).toEqual([])` with one descriptor number received (the scratch run showed `+   26,`; the number varies).
- `closing a sink again leaves the sink now registered for its path` fails on `toBe(second)` with `Expected: FileSinkImpl {` and `Received: FileSinkImpl {`.

Keep the failing output for your report. If either new test passes before Step 2, STOP.

### Step 2: Take the sink out of the registry before `close()` waits

In `src/output/file-sink.ts`, change `close()` (lines 195 to 201) to:

```ts
  async close(): Promise<void> {
    // Unregister before the first await: a write issued while this close
    // runs then opens a new sink that a later close can still find.
    if (sinks.get(this.filePath) === this) {
      sinks.delete(this.filePath)
    }
    await this.flush()
    const { handle } = this
    this.handle = null
    await handle?.close()
  }
```

The `sinks.get(this.filePath) === this` guard is what makes the second new test pass: a sink object closed a second time must not remove the sink that has replaced it. Change nothing else in the file.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/output/file-sink-lifecycle.test.ts` reports 9 pass and 0 fail. Then `bun test ./__tests__/output/` reports 0 fail (65 tests at `c019a4f` plus the 2 new ones; the scratch copy of the patched source passed all of them).

### Step 3: Gates

**Verify**, in this order:

- `bun run format` (root), read its diff, then `bun run lint` exits 0
- `cd packages/logixlysia && bun run typecheck` exits 0
- `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail

Commit `file-sink.ts` and the test file as commit 1, staging the two files by name.

### Step 4: Changeset

Create `.changeset/file-sink-close-race.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

The paragraph says: a log line written while `flushLogixlysia(options, { close: true })` was running reopened the log file on a sink the plugin no longer tracked, so its file descriptor stayed open until the process exited, even across another close. Such a line now goes to a sink the next close releases. No line was lost before or after. Write it in your own plain words.

**Verify**: `bun run lint` exits 0. Commit the changeset as commit 2. `git status --porcelain` is empty afterwards.

## Test plan

- Two new tests in `__tests__/output/file-sink-lifecycle.test.ts`. Both fail before Step 2 and pass after it.
- The existing tests in that file keep passing unchanged, in particular `close() releases the handle and a later write reopens the file` and `close() is idempotent`.
- No test reads `lsof`, `/dev/fd` or the module's private fields. The open-descriptor check uses only Bun's `FileHandle` (its `fd` and its `write` method), not an interface of the operating system. It was run on macOS.

## Done criteria

ALL must hold:

- [ ] `cd packages/logixlysia && bun test ./__tests__/output/file-sink-lifecycle.test.ts` reports 9 pass, 0 fail
- [ ] Your report quotes the Step 1 run, made before any source change, with its 2 failures
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the three in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/output/file-sink.ts` shows changes inside `close()` and nowhere else
- [ ] `git diff <base>..HEAD -- packages/logixlysia/__tests__/api` is empty

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts in "Current state" do not match the code.
- A new test passes before Step 2, or a test other than the two new ones fails before Step 2.
- `tracker.openDescriptors()` is not empty after Step 2. That means a sink still reopens the file after its close, and the fix needs a change outside `close()`.
- An existing test in `__tests__/output/` fails after Step 2 and passes before it.
- The fix seems to need `src/output/index.ts`, `src/output/shutdown.ts` or `src/index.ts`.
- `spyOn(prototype, 'write')` records no handle (the tracker cannot see the sink's writes on your Bun version). Do not replace it with `lsof` or `/dev/fd`.

## Maintenance notes

- Between the start of `close()` and the moment its handle is closed, the closing sink and a new sink for the same path can both hold the file open. Both append, so no line is lost, but a line issued during the close can land before the closing sink's last batch. If the closing sink's last batch rotates the file, a new sink that opened the file just before the rename writes into the archive. Both need a write to race a close and a rotation together. If they ever matter, the new sink can start its `flushChain` from the closing sink's close instead of from a resolved promise.
- A write through a sink object kept from before its close still reopens the file on that unregistered object. No caller does this: `src/output/file.ts` looks the sink up for every line. Routing such a write through `getFileSink` (a `closed` flag checked at the top of `write()`) closes that too; it was prototyped and passes, and was left out because no caller needs it.
- A reviewer should check that the registry is changed before the first `await` in `close()`, and that the guard compares with `this`.
- `plans/README.md` lists this finding under "Deferred findings" of the November ninth pass. The coordinator decided to plan it in this pass.
