# Plan 146: Interval rotation rotates before the first line of a new period, so that line opens the new file

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/output/file-sink.ts packages/logixlysia/src/types/config.ts packages/logixlysia/__tests__/output/interval-rotation.test.ts`
> This plan lands after plan 145, which changes `close()` in
> `packages/logixlysia/src/output/file-sink.ts`, so the drift check will list
> that file. The excerpts below are of the file before plan 145. For that file,
> compare only the excerpts of the lines this plan changes (`flushBatch`,
> `shouldRotateNow` and `maybeRotate`, `src/output/file-sink.ts:100-186` at
> `c019a4f`) against the live code; a change inside `close()` or near the
> `sinks` registry is expected and is not drift. Run
> `git diff c019a4f..HEAD -- packages/logixlysia/src/output/file-sink.ts`: if
> it touches anything other than `close()`, or if any other in-scope file
> changed, compare the "Current state" excerpts against the live code. On a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/145-file-sink-close-does-not-leak-a-descriptor.md (same file; land 145 first)
- **Category**: bug
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

With `logRotation: { interval: '1d' }`, a user expects each archived file to hold one period's lines. Today the sink writes a batch to the live file first and only then checks whether the interval has elapsed. So the first line written after the period ends goes into the file that is about to be archived, and the new live file starts with the second line. After a restart the same happens to the old file: the new process's first line is appended to yesterday's file, which is then archived.

Measured at `c019a4f` on Bun 1.3.14 through the plugin, with `interval: '1h'`, one request, `Date.now` moved two hours ahead for the second request and set back for the third (three runs, same result each time):

```
app.log => [ "/day2-second-line" ]
app.log.2026-11-22-02-40-33-410-5069165750 => [ "/day1-line", "/day2-first-line" ]
```

With the fix applied to a copy of the source, the same probe prints:

```
app.log => [ "/day2-first-line", "/day2-second-line" ]
app.log.2026-11-22-02-40-56-954-4689109000 => [ "/day1-line" ]
```

After this plan, the interval is checked before a batch is written: when it has elapsed, the file rotates and the batch is written to the new file. A batch is never split across two files. Size rotation keeps its rotate-after-write behaviour, so a file still rolls over once a write takes it past `maxSize`.

## Current state

All source paths are relative to `packages/logixlysia/`.

`src/output/file-sink.ts` writes log lines in batches (all the lines of one microtask). `flushBatch` writes the batch, then calls `maybeRotate`:

```ts
// src/output/file-sink.ts:100-121 at c019a4f
  private async flushBatch(batch: PendingBatch): Promise<void> {
    const options = this.latestOptions
    const text = batch.lines.join('')

    try {
      await this.ensureOpen(options)
      const handle = this.handle as FileHandle
      await handle.write(text)
      this.bytesWritten += Buffer.byteLength(text)
    } catch (error) {
      for (const resolver of batch.resolvers) {
        resolver.reject(error)
      }
      return
    }

    await this.maybeRotate(options)

    for (const resolver of batch.resolvers) {
      resolver.resolve()
    }
  }
```

`ensureOpen` (lines 123 to 135) does nothing when a handle is open. Otherwise it opens the file in append mode and sets `this.openedAt` from the file's birthtime, falling back to `Date.now()`, so an existing file's age survives a restart.

One check covers both triggers, and `maybeRotate` runs it:

```ts
// src/output/file-sink.ts:137-186 at c019a4f
  private shouldRotateNow(rotation: LogRotationConfig): boolean {
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

  private async maybeRotate(options: FileSinkOptions): Promise<void> {
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
      this.rotationFailed = true
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

`maybeRotate` never throws: a failed rotation is reported and the sink carries on. After a rotation the handle is `null`, and the next `ensureOpen` opens a fresh live file.

The archive's name comes from `rotateFile` in `src/output/rotation-manager.ts:57-71`: `getRotatedFileName(filePath, new Date())` plus a `process.hrtime.bigint()` suffix. The stamp is the moment of rotation, which is the time of the write that triggered it. This plan does not change it: after the change that write is the first line of the new period, so the stamp still reads as "archived at", the start of the next file. An empty live file is not renamed (`rotateFile` returns `''` when `stat.size === 0`).

The doc comment of the option, `src/types/config.ts:37-42`:

```ts
  /**
   * Rotate when the live file's age reaches a fixed interval, evaluated on
   * write (an idle process rotates on its next write, not on a timer).
   * Format: number + 'h' | 'd' | 'w', e.g. '12h', '1d', '1w'.
   */
  interval?: string
```

The interval tests are in `__tests__/output/interval-rotation.test.ts`. They write through `logToFile` (the plugin's file writer) and move the clock with `setSystemTime` from `bun:test`, restoring it in `afterEach`; no test waits in real time. Two of them pin today's behaviour, which this plan changes:

```ts
// __tests__/output/interval-rotation.test.ts:24, 63-68 and 83-86
  test('rotates on the first write after the interval elapses', async () => {
      …
      expect(rotatedContent).toContain('msg-1')
      expect(rotatedContent).toContain('msg-2')
      …
      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('msg-3')
      expect(liveContent).not.toContain('msg-1')
      expect(liveContent).not.toContain('msg-2')
```

```ts
// __tests__/output/interval-rotation.test.ts:204 and 232-237
  test('restart simulation: birthtime survives, fresh sink rotates immediately', async () => {
      …
      const rotatedContent = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toContain('seed')
      expect(rotatedContent).toContain('after-restart')
```

The test that guards size rotation's rotate-after-write behaviour is `a size rotation rolls the file over once it passes maxSize` in `__tests__/output/file-sink-lifecycle.test.ts`: it expects the archive to be exactly `'x'.repeat(2048) + 'next\n'`, so the write that crossed `maxSize` stays in the archive. It must keep passing unchanged.

Conventions to match:

- Comments say why, never what.
- Tests call `logToFile` the way the neighbouring tests in `interval-rotation.test.ts` do and move time only with `setSystemTime`.
- Two `logToFile` calls started in the same tick land in one batch: `logToFile` calls `getFileSink(filePath).write(…)` before its first `await`.

## Commands you will need

Run lint and format from the worktree root. Run the rest from the directory shown.

| Purpose       | Command                                                                                   | Expected on success                                   |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Install       | `bun install --frozen-lockfile` (root)                                                    | exit 0                                                |
| Build         | `cd packages/logixlysia && bun run build`                                                 | `Build completed`                                     |
| Lint          | `bun run lint` (root)                                                                     | exit 0                                                |
| Format        | `bun run format` (root)                                                                   | exit 0; read the diff it makes                        |
| Typecheck     | `cd packages/logixlysia && bun run typecheck`                                             | exit 0                                                |
| One test file | `cd packages/logixlysia && bun test ./__tests__/output/interval-rotation.test.ts`         | judge by pass and fail counts (exit is 1 on a subset) |
| Output tests  | `cd packages/logixlysia && bun test ./__tests__/output/`                                  | 0 fail                                                |
| Full suite    | `cd packages/logixlysia && bun test`                                                      | 0 fail (one test more than before this plan)          |

On a heavily loaded machine these file tests can pass Bun's 5 second default because removing a temp directory is slow. If a test fails with a timeout and no assertion message, run the file again with `--timeout 60000` and judge by that run.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/src/output/file-sink.ts` (`flushBatch`, `shouldRotateNow`, `maybeRotate`, and one type alias above the `sinks` registry)
- `packages/logixlysia/src/types/config.ts` (the doc comment of `interval` only)
- `packages/logixlysia/__tests__/output/interval-rotation.test.ts`
- `.changeset/interval-rotation-before-write.md` (create)

**Out of scope** (do NOT touch):

- `close()`, `flush()`, `write()`, `getFileSink` and the `sinks` registry in `file-sink.ts`. Plan 145 changed `close()`; keep this change away from it.
- `src/output/rotation-manager.ts` and the archive's file name.
- Size rotation's timing. `maxSize` is still checked after the batch is written.
- `apps/docs/content/features/log-rotation.mdx`. Another pull request owns that page. Its sentence "Both are checked after every write batch" (line 73) becomes wrong for `interval` after this plan; report that, do not edit the page.
- `src/output/index.ts`, `src/output/shutdown.ts`, and the `flushLogixlysia` and `onStop` parts of `src/index.ts`.
- Any new option, export or dependency.

## Git workflow

- Branch: `fix/interval-rotation-before-write`, cut from the base commit your task names (after plan 145 has landed).
- Three commits, in this order:
  1. `fix(output): rotate on an elapsed interval before writing the batch` (`file-sink.ts` and `interval-rotation.test.ts`; it turns the three changed or new tests green)
  2. `docs(output): say the rotation interval is checked before each write` (the `config.ts` doc comment)
  3. `chore(changeset): note the interval rotation fix`
- Each commit body is one to three short paragraphs of plain prose: what was wrong for a user, what the change does, what a reader would not guess from the diff.
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Change the two tests that pin the old behaviour and add one

In `__tests__/output/interval-rotation.test.ts`:

1. Rename `'rotates on the first write after the interval elapses'` to `'the first line after the interval elapses opens the new file'`. In its body, change the archive assertions to:

   ```ts
      expect(rotatedContent).toContain('msg-1')
      expect(rotatedContent).not.toContain('msg-2')
   ```

   and the live file assertions at the end to:

   ```ts
      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).not.toContain('msg-1')
      expect(liveContent).toContain('msg-2')
      expect(liveContent).toContain('msg-3')
   ```

   Leave the rest of the test, including `expect(rotated.length).toBe(1)`, as it is.

2. Rename `'restart simulation: birthtime survives, fresh sink rotates immediately'` to `'restart simulation: birthtime survives, the old file rotates before the first write'`. Replace its last two assertions (`toContain('seed')` and `toContain('after-restart')` on `rotatedContent`) with:

   ```ts
      expect(rotatedContent).toBe('seed\n')

      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('after-restart')
   ```

3. Add a new test directly before `test('idle process does not rotate until the next write', …)`:

   ```ts
  test('lines written in one tick after the interval stay together in the new file', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'batch.log')
      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }

      const firstRequest = createMockRequest('http://localhost/first')
      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(firstRequest),
        request: firstRequest,
        store: { beforeTime: 0n }
      })

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      const secondRequest = createMockRequest('http://localhost/second')
      const thirdRequest = createMockRequest('http://localhost/third')
      await Promise.all([
        logToFile({
          data: { message: 'msg-2' },
          filePath,
          level: 'INFO',
          options,
          precomputed: precomputedFor(secondRequest),
          request: secondRequest,
          store: { beforeTime: 0n }
        }),
        logToFile({
          data: { message: 'msg-3' },
          filePath,
          level: 'INFO',
          options,
          precomputed: precomputedFor(thirdRequest),
          request: thirdRequest,
          store: { beforeTime: 0n }
        })
      ])

      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('batch.log.'))
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent.split('\n').filter(Boolean)).toHaveLength(1)
      expect(rotatedContent).toContain('msg-1')

      const liveContent = await fs.readFile(filePath, 'utf-8')
      const liveLines = liveContent.split('\n').filter(Boolean)
      expect(liveLines).toHaveLength(2)
      expect(liveLines[0]).toContain('msg-2')
      expect(liveLines[1]).toContain('msg-3')
    } finally {
      await removeTempDir(dir)
    }
  })
   ```

   Both `logToFile` calls must start before anything is awaited, so that `msg-2` and `msg-3` are one batch.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/output/interval-rotation.test.ts` reports 5 pass and 3 fail. The three failures are the three tests this step changed or added:

- `the first line after the interval elapses opens the new file`: `Expected to not contain: "msg-2"`, with the archive holding the `/first … msg-1` and `/second … msg-2` lines.
- `restart simulation: birthtime survives, the old file rotates before the first write`: `toBe` fails with `+ Received  + 1` (the `after-restart` line is in the archive).
- `lines written in one tick after the interval stay together in the new file`: `Expected length: 1`, `Received length: 3`.

Keep the failing output for your report. If any other test fails, or one of these three passes, STOP.

### Step 2: Check the interval before the write, the size after it

In `src/output/file-sink.ts`:

1. Directly above `const sinks = new Map<string, FileSink>()`, add:

   ```ts
   type RotationTrigger = 'interval' | 'size'
   ```

2. Give `shouldRotateNow` a trigger, so each call checks one condition:

   ```ts
  private shouldRotateNow(
    rotation: LogRotationConfig,
    trigger: RotationTrigger
  ): boolean {
    if (trigger === 'size') {
      return (
        rotation.maxSize !== undefined &&
        this.bytesWritten > parseSize(rotation.maxSize)
      )
    }
    return (
      rotation.interval !== undefined &&
      Date.now() - this.openedAt >= parseInterval(rotation.interval)
    )
  }
   ```

3. Give `maybeRotate` the same parameter and pass it on. Its signature becomes `private async maybeRotate(options: FileSinkOptions, trigger: RotationTrigger): Promise<void>`, and its check becomes `if (!this.shouldRotateNow(rotation, trigger)) {`. Leave the rest of its body as it is.

4. In `flushBatch`, check the interval after the file is open and before the write, and the size where the single check is today:

   ```ts
    try {
      await this.ensureOpen(options)
      // A line belongs in the file of the period it was written in, so an
      // elapsed interval rotates before the batch is written.
      await this.maybeRotate(options, 'interval')
      await this.ensureOpen(options)
      const handle = this.handle as FileHandle
      await handle.write(text)
      this.bytesWritten += Buffer.byteLength(text)
    } catch (error) {
      for (const resolver of batch.resolvers) {
        resolver.reject(error)
      }
      return
    }

    await this.maybeRotate(options, 'size')
   ```

   The first `ensureOpen` is needed: on a sink's first batch it reads the existing file's birthtime into `openedAt`, which is how a restart sees that yesterday's file is already past its interval. The second `ensureOpen` reopens the live file after a rotation and does nothing otherwise. A failed rotation is reported inside `maybeRotate` as today, and the batch is still written to the live file.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/output/interval-rotation.test.ts` reports 8 pass and 0 fail. Then `bun test ./__tests__/output/` reports 0 fail; `a size rotation rolls the file over once it passes maxSize` and `maxSize fires first when both triggers are configured` must be among the passes. (In a scratch copy of the source with plan 145's `close()` change and this step applied, all 66 tests in `__tests__/output/` passed: the 65 at `c019a4f` plus the new one. With plan 145's two tests in the base, expect 68.)

### Step 3: Correct the doc comment

In `src/types/config.ts`, replace the doc comment of `interval` (lines 37 to 41 at `c019a4f`) with:

```ts
  /**
   * Rotate when the live file's age reaches a fixed interval. The age is
   * checked before each write, so the first line written after the interval
   * goes into the new file. An idle process rotates on its next write, not
   * on a timer. Format: number + 'h' | 'd' | 'w', e.g. '12h', '1d', '1w'.
   */
```

**Verify**: `bun run format` (root), read its diff, then `bun run lint` exits 0 and `cd packages/logixlysia && bun run typecheck` exits 0.

### Step 4: Gates and commits

**Verify**: `cd packages/logixlysia && bun run build` succeeds, then `bun test` reports 0 fail. Make commits 1 and 2 from "Git workflow", staging files by name.

### Step 5: Changeset

Create `.changeset/interval-rotation-before-write.md`:

```md
---
'logixlysia': patch
---

<one short paragraph for a user of the package>
```

The paragraph says: with `logRotation.interval`, the first line written after an interval elapsed went into the file being archived, so each archive ended with one line from the next period, and after a restart the new process's first line was appended to the old file. The interval is now checked before a write, so that line starts the new file. `maxSize` rotation is unchanged. Write it in your own plain words.

**Verify**: `bun run lint` exits 0. Commit the changeset as commit 3. `git status --porcelain` is empty afterwards.

## Test plan

- Two changed tests and one new test in `__tests__/output/interval-rotation.test.ts`. All three fail before Step 2 and pass after it.
- `a size rotation rolls the file over once it passes maxSize` in `file-sink-lifecycle.test.ts` and `maxSize fires first when both triggers are configured` in `interval-rotation.test.ts` pin that size rotation still happens after the write. Neither changes.
- Time is moved only with `setSystemTime`; no test sleeps waiting for an interval.

## Done criteria

ALL must hold:

- [ ] `cd packages/logixlysia && bun test ./__tests__/output/interval-rotation.test.ts` reports 8 pass, 0 fail
- [ ] Your report quotes the Step 1 run, made before any source change, with its 3 failures
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail
- [ ] `git diff <base>..HEAD --stat` lists exactly the four in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/output/file-sink.ts` shows no change inside `close()`, `flush()`, `write()` or `getFileSink`
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src/output/rotation-manager.ts packages/logixlysia/__tests__/api` is empty

## STOP conditions

Stop and report (do not improvise) if:

- The excerpts of `flushBatch`, `shouldRotateNow`, `maybeRotate`, the `interval` doc comment or the two interval tests do not match the code. (A changed `close()` is expected from plan 145 and is not a mismatch.)
- Plan 145 has not landed and your base still has `sinks.delete(this.filePath)` as the last line of `close()`. This plan can run without it, but the coordinator ordered them; ask.
- A Step 1 test this plan says fails passes before Step 2, or another test fails before Step 2.
- `a size rotation rolls the file over once it passes maxSize` fails after Step 2. Size rotation must keep its timing.
- The fix seems to need `rotation-manager.ts`, a change to the archive name, or a second interval check inside one batch.

## Maintenance notes

- The archive's stamp is the time of rotation, which is the time of the first write of the new period, not the end of the old one. With a long idle gap the stamp can be hours or days after the archive's last line. This plan keeps that, as asked; a name taken from `openedAt` or from the last write would describe the archive's own period, and is a separate change to file names users may already parse.
- Only one interval check runs per batch. A batch that arrives exactly as a period ends is written whole to the new file. A sink whose clock runs ahead of the file system's birthtime (as in tests that move the clock) can rotate on the next batch again; that was true before.
- From reading the code (not run): a failed interval rotation retries on every batch and reports each time, because `ensureOpen` reads the unrenamed file's old birthtime back into `openedAt`. That was true before and this plan does not change it; size rotation has its own `rotationFailed` handling from an earlier plan.
- `apps/docs/content/features/log-rotation.mdx:73` says both triggers "are checked after every write batch". After this plan that is true only of `maxSize`. The page belongs to another pull request; the sentence needs to say the interval is checked before the batch is written.
