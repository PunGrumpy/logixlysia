# Plan 151: Tests pin `logDirMode` and `disableWebSocketLogging`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. Do not improvise. Skip any instruction to update `plans/README.md`:
> the coordinator maintains the index.
>
> **Drift check (run first)**: `git diff --stat c019a4f..HEAD -- packages/logixlysia/src/output/file.ts packages/logixlysia/src/output/file-sink.ts packages/logixlysia/src/output/fs.ts packages/logixlysia/src/websocket/wrap-ws.ts packages/logixlysia/__tests__/output packages/logixlysia/__tests__/websocket packages/logixlysia/__tests__/_helpers`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. On a
> mismatch, treat it as a STOP condition. A change to `src/websocket/wrap-ws.ts`
> that adds an ERROR line for a hook that throws is expected (another pull
> request makes it) and is not a mismatch, as long as the three
> `disableWebSocketLogging` checks shown below still guard the lines for hooks
> that succeed. Edits that pull request makes to the existing files under
> `__tests__/websocket/` are not a mismatch either.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `c019a4f`, 2026-11-22

## Why this matters

Two documented options have no test. `grep -rn "logDirMode\|disableWebSocketLogging" packages/logixlysia/__tests__` prints nothing at `c019a4f`.

- `logDirMode` sets the permission mode of the directories the file sink creates for `logFilePath`. A user sets it so that, for example, a log-shipping group can read the directory (`0o750`) while the default stays private (`0o700`). If the value stopped reaching `mkdir`, every log directory would silently be `700` and the shipper would lose access. Nothing would fail.
- `disableWebSocketLogging` turns off the `WebSocket opened`, `WebSocket message` and `WebSocket closed` lines that `wrapWs` writes. If the check were lost, a user who turned the lines off to cut volume would get them back. Nothing would fail.

Both work today. Measured at `c019a4f` on Bun 1.3.14 under umask `022`: `logDirMode: 0o750` gives a directory of mode `750` and the default gives `700`; `disableWebSocketLogging: false` gives the three lifecycle lines and `true` gives none. After this plan, two new test files fail if either option stops working. This was shown by running them against copies of the source in which each option is ignored: 2 of the `logDirMode` tests and 1 of the WebSocket tests fail there.

## Current state

All paths are relative to `packages/logixlysia/`.

`logDirMode` is documented at `src/types/config.ts:249-250`:

```ts
  /** Directory mode for created log directories. @default 0o700 */
  logDirMode?: number
```

It goes from `logToFile` to the file sink at `src/output/file.ts:67-73`:

```ts
  try {
    await getFileSink(filePath).write(line, {
      logDirMode: config?.logDirMode,
      logFileMode: config?.logFileMode,
      logRotation: config?.logRotation,
      onRotationError
    })
```

The sink creates the directory at `src/output/file-sink.ts:128`:

```ts
    await ensureDir(path.dirname(this.filePath), options.logDirMode)
```

and `src/output/fs.ts` in full:

```ts
import { promises as fs } from 'node:fs'

export const ensureDir = async (
  dirPath: string,
  mode = 0o700
): Promise<void> => {
  await fs.mkdir(dirPath, { mode, recursive: true })
}
```

`mkdir` with `recursive: true` gives every directory it creates the same mode, and the process umask clears bits from it.

The default (`700`) is already pinned by `__tests__/output/file.test.ts:155-179`, the test `'creates log files with 0600 mode and directories with 0700 mode by default'`. No test sets `logDirMode`. That file's tests are the pattern to follow. The neighbouring test `'honors a configured logFileMode'` (lines 181 to 203):

```ts
  test('honors a configured logFileMode', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'custom-mode.log')
      const options: Options = { config: { logFileMode: 0o644 } }

      const request = createMockRequest('http://localhost/test')
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const fileStat = await fs.stat(filePath)
      expect(permBits(fileStat.mode)).toBe('644')
    } finally {
      await removeTempDir(dir)
    }
  })
```

`__tests__/_helpers/perm-bits.ts` in full: `export const permBits = (mode: number): string => mode.toString(8).slice(-3)`.

How the existing permission tests handle the umask: they do not set or read it. They assert literal modes (`'600'`, `'700'`, `'644'`, `'640'`) and so assume a umask that clears no owner or group bit the test expects. That holds for the default umask `022` on macOS and on CI (`ubuntu-latest` in `.github/workflows/validate.yml`), and `'644'` in `file.test.ts:199` already depends on it. The new test follows the same approach and uses `0o750`, which gives `750` under both `022` and `027`.

`disableWebSocketLogging` is documented at `src/types/config.ts:300-301`:

```ts
  /** Skip automatic WebSocket lifecycle logs from `wrapWs`; default false. */
  disableWebSocketLogging?: boolean
```

`src/websocket/wrap-ws.ts` checks it once per lifecycle hook, after the user's hook has run (lines 125, 155 and 173). The `open` hook, lines 170 to 185:

```ts
      open(ws) {
        wsTimings.set(keyOf(ws), process.hrtime.bigint())
        const done = (): void => {
          if (options.config?.disableWebSocketLogging !== true) {
            logWs('INFO', ws, path, 'WebSocket opened')
          }
        }
        let result: unknown
        try {
          result = hooks.open?.(ws)
        } catch (error) {
          done()
          throw error
        }
        return afterHook(result, done)
      }
```

The plugin builds the wrapper from the user's options at `src/index.ts:388-393` and exposes it as `plugin.wrapWs`:

```ts
  const wrapWs = createWsHandlerWrapper(
    options,
    baseLogger,
    contextStore,
    sinks.pathFilter
  )
```

The pattern for the WebSocket test is the last test of `__tests__/websocket/log-filter-paths.test.ts` (lines 81 to 101), which builds the plugin with a mock transport and drives `plugin.wrapWs` with hooks that succeed. With synchronous hooks the lines are written synchronously, so the test needs no wait:

```ts
test('the plugin applies the filter to the sockets it wraps', () => {
  const transport = mock((_level: unknown, _message: unknown) => {})
  const plugin = logixlysia({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      logFilter: { exclude: ['/ws/**'] },
      showStartupMessage: false,
      transports: [{ log: transport }]
    }
  })

  lifecycle(plugin.wrapWs, '/ws/chat')
  lifecycle(plugin.wrapWs, '/chat')

  expect(messages(transport)).toEqual([
    'WebSocket opened',
    'WebSocket message',
    'WebSocket closed'
  ])
})
```

Another pull request is changing `src/websocket/wrap-ws.ts` so that a hook that throws gets an ERROR line, while `disableWebSocketLogging` still silences every WebSocket line. The new test uses only hooks that succeed, so it stays true after that change. It lives in a new file so that it does not conflict with the existing WebSocket test files.

Conventions: tests use `bun:test`, import source from `../../src/...` and helpers from `../_helpers/...`, assert literal values, and keep `describe` nesting to one level. The last test-only change in this repository (commit `0a46381`) carried an empty changeset, a file containing only `---` and `---`.

## Commands you will need

Run lint and format from the worktree root. Run the rest from `packages/logixlysia`.

| Purpose        | Command                                                                                                       | Expected on success                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Install        | `bun install --frozen-lockfile` (root)                                                                        | exit 0                                                |
| Build          | `cd packages/logixlysia && bun run build`                                                                     | `Build completed`                                     |
| Lint           | `bun run lint` (root)                                                                                         | exit 0                                                |
| Format         | `bun run format` (root)                                                                                       | exit 0; read the diff it makes                        |
| Typecheck      | `cd packages/logixlysia && bun run typecheck`                                                                 | exit 0                                                |
| The new files  | `cd packages/logixlysia && bun test ./__tests__/output/log-dir-mode.test.ts ./__tests__/websocket/disable-websocket-logging.test.ts` | judge by pass and fail counts (exit is 1 on a subset) |
| Full suite     | `cd packages/logixlysia && bun test`                                                                          | 0 fail (1249 tests in 100 files before this plan)     |

`bun test <files>` exits 1 on a subset even with zero failures, because the coverage threshold applies to the whole tree.

## Scope

**In scope** (the only files you may modify or create):

- `packages/logixlysia/__tests__/output/log-dir-mode.test.ts` (create)
- `packages/logixlysia/__tests__/websocket/disable-websocket-logging.test.ts` (create)
- `.changeset/log-dir-mode-and-websocket-logging-tests.md` (create)

**Out of scope** (do NOT touch):

- Anything under `packages/logixlysia/src/`. Both options work; this plan only pins them. The temporary source edits in Step 4 must be reverted before you commit.
- `__tests__/output/file.test.ts`, `__tests__/websocket/wrap-ws.test.ts`, `__tests__/websocket/wrap-ws-results.test.ts`, `__tests__/websocket/wrap-ws-server.test.ts`, `__tests__/websocket/log-filter-paths.test.ts`. Another pull request is editing the WebSocket tests; adding to them would conflict.
- `__tests__/_helpers/`. The helpers you need already exist.
- Any test of a hook that throws, or of the ERROR line for it. That belongs to the other pull request.
- Setting or reading `process.umask()` in a test. It is global to the test process.

## Git workflow

- Branch: `test/log-dir-mode-and-websocket-logging`, cut from the base commit your task names.
- Two commits, in this order:
  1. `test: pin logDirMode and disableWebSocketLogging` (the two test files), with a body of one or two short paragraphs in plain prose: both options were documented and untested, what each new test asserts, and that each test was seen to fail with the option ignored.
  2. `chore(changeset): add an empty changeset for the option tests` (the changeset)
- Do not push or open a pull request unless your task message tells you to.

## Steps

### Step 1: Confirm neither option is tested

From `packages/logixlysia`:

```
grep -rn "logDirMode\|disableWebSocketLogging" __tests__
```

**Verify**: it prints nothing. If it prints a match, STOP and report the file: the option may already be pinned.

### Step 2: Write the `logDirMode` test

Create `packages/logixlysia/__tests__/output/log-dir-mode.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { permBits } from '../_helpers/perm-bits'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

describe('logDirMode', () => {
  test('creates the log directory with the configured mode', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'dir-mode.log')
      const options: Options = { config: { logDirMode: 0o750 } }

      const request = createMockRequest('http://localhost/test')
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const dirStat = await fs.stat(path.dirname(filePath))
      expect(permBits(dirStat.mode)).toBe('750')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('applies the configured mode to every directory it creates', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'app', 'nested-mode.log')
      const options: Options = { config: { logDirMode: 0o750 } }

      const request = createMockRequest('http://localhost/test')
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const outer = await fs.stat(path.join(dir, 'logs'))
      const inner = await fs.stat(path.join(dir, 'logs', 'app'))
      expect(permBits(outer.mode)).toBe('750')
      expect(permBits(inner.mode)).toBe('750')
    } finally {
      await removeTempDir(dir)
    }
  })
})
```

Each test uses its own temporary directory, so the file sink, which is cached per file path, is never shared with another test.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/output/log-dir-mode.test.ts` reports 2 pass, 0 fail.

### Step 3: Write the `disableWebSocketLogging` test

Create `packages/logixlysia/__tests__/websocket/disable-websocket-logging.test.ts`:

```ts
import { describe, expect, mock, test } from 'bun:test'
import { logixlysia } from '../../src'

const setup = (disableWebSocketLogging: boolean) => {
  const transport = mock((_level: unknown, _message: unknown) => {})
  const plugin = logixlysia({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      disableWebSocketLogging,
      showStartupMessage: false,
      transports: [{ log: transport }]
    }
  })
  return { plugin, transport }
}

const messages = (transport: ReturnType<typeof setup>['transport']) =>
  transport.mock.calls.map(call => String(call[1]))

const lifecycle = (wrapWs: ReturnType<typeof setup>['plugin']['wrapWs']) => {
  const calls: string[] = []
  const hooks = wrapWs('/chat', {
    close(_ws, _code, _reason) {
      calls.push('close')
    },
    message(_ws, _message) {
      calls.push('message')
    },
    open(_ws) {
      calls.push('open')
    }
  })
  const ws = { id: 'ws-chat' }
  hooks.open?.(ws)
  hooks.message?.(ws, 'hi')
  hooks.close?.(ws, 1000, 'bye')
  return calls
}

describe('disableWebSocketLogging', () => {
  test('false logs open, message and close', () => {
    const { plugin, transport } = setup(false)

    lifecycle(plugin.wrapWs)

    expect(messages(transport)).toEqual([
      'WebSocket opened',
      'WebSocket message',
      'WebSocket closed'
    ])
  })

  test('true logs no lifecycle line and still runs every hook', () => {
    const { plugin, transport } = setup(true)

    const calls = lifecycle(plugin.wrapWs)

    expect(messages(transport)).toEqual([])
    expect(calls).toEqual(['open', 'message', 'close'])
  })
})
```

Every hook here returns normally. Do not add a hook that throws.

**Verify**: `cd packages/logixlysia && bun test ./__tests__/websocket/disable-websocket-logging.test.ts` reports 2 pass, 0 fail.

### Step 4: Show each test fails when its option is ignored

This step edits source temporarily. Revert each edit before the next.

1. In `src/output/file.ts`, change `logDirMode: config?.logDirMode,` to `logDirMode: undefined,`. Run `bun test ./__tests__/output/log-dir-mode.test.ts`.

   **Verify**: 0 pass, 2 fail, each with `Expected: "750"` and `Received: "700"`. Then `git checkout -- src/output/file.ts`.

2. In `src/websocket/wrap-ws.ts`, replace each of the three `options.config?.disableWebSocketLogging !== true` with `true`. Run `bun test ./__tests__/websocket/disable-websocket-logging.test.ts`.

   **Verify**: 1 pass, 1 fail; the failing test is `disableWebSocketLogging > true logs no lifecycle line and still runs every hook`. Then `git checkout -- src/websocket/wrap-ws.ts`.

**Verify** after both: `git status --porcelain packages/logixlysia/src` (from the root) prints nothing.

If a test passes with its option ignored, STOP: the test does not pin the option.

### Step 5: Empty changeset

This change ships nothing to users. Create `.changeset/log-dir-mode-and-websocket-logging-tests.md` containing exactly two lines:

```
---
---
```

**Verify**: `wc -l < .changeset/log-dir-mode-and-websocket-logging-tests.md` prints 2.

### Step 6: Gates and commit

From the root run `bun run format` and read its diff (it may re-wrap the new files and must not change any other file), then `bun run lint`. From `packages/logixlysia` run `bun run build`, `bun run typecheck`, then `bun test`.

**Verify**: lint exits 0, typecheck exits 0, and the full suite reports 0 fail with 1253 tests in 102 files (1249 in 100 before, plus 4 tests in 2 files). Make the two commits described under "Git workflow", staging files by name. `git status --porcelain` is empty afterwards (run `git checkout AGENTS.md` first if a tool modified it).

## Test plan

- `__tests__/output/log-dir-mode.test.ts`: 2 tests. The configured `0o750` reaches the directory the sink creates, and reaches every directory of a nested path.
- `__tests__/websocket/disable-websocket-logging.test.ts`: 2 tests. `false` writes the three lifecycle lines in order; `true` writes none and every user hook still runs.
- All 4 pass at `c019a4f` with no source change. With the option ignored (Step 4) 2 and 1 of them fail. This was run on a copy of the source before this plan was written: `Received: "700"` for both `logDirMode` tests, and the `true` WebSocket test received the lifecycle lines where it expected `[]`.

## Done criteria

ALL must hold:

- [ ] `git diff --stat <base>..HEAD` lists exactly the three in-scope files
- [ ] `git diff <base>..HEAD -- packages/logixlysia/src packages/logixlysia/__tests__/websocket/wrap-ws.test.ts packages/logixlysia/__tests__/websocket/wrap-ws-results.test.ts packages/logixlysia/__tests__/websocket/wrap-ws-server.test.ts packages/logixlysia/__tests__/websocket/log-filter-paths.test.ts packages/logixlysia/__tests__/output/file.test.ts` is empty
- [ ] Your report quotes both Step 4 runs with their failure counts
- [ ] `bun run lint` exits 0; `cd packages/logixlysia && bun run typecheck` exits 0
- [ ] `cd packages/logixlysia && bun test` reports 0 fail

## STOP conditions

Stop and report (do not improvise) if:

- Step 1's grep prints a match.
- A new test fails at Step 2 or Step 3 with no source change. For `logDirMode`, a `Received: "700"` or `"710"`-style value without a source change means the process umask clears group bits: report the output of `umask` and do not change the expected value.
- A test passes in Step 4 with its option ignored.
- The three `disableWebSocketLogging` checks in `src/websocket/wrap-ws.ts` are gone or moved so that Step 4's edit does not apply. Read the file: if the other pull request has landed and the option is now checked in one place, make the equivalent one-place edit for Step 4 and say so in your report; if you cannot find where it is checked, STOP.
- The fix seems to need a change under `src/` or to an existing test file.

## Maintenance notes

- The `logDirMode` assertions assume the default umask `022` (or `027`), like every permission test in `__tests__/output/`. A machine with umask `077` fails them and the existing `'644'` and `'640'` assertions alike.
- When the other pull request adds an ERROR line for a hook that throws, a test that `disableWebSocketLogging: true` also silences that line belongs with that change, not here.
- Left out: no test runs a real `Bun.serve` socket with `disableWebSocketLogging`; `__tests__/websocket/wrap-ws-server.test.ts` covers the real-socket path for the default, and the option is read in the same wrapper either way.
- Left out: `logFileMode` is already pinned by `__tests__/output/file.test.ts:181-203`; it needed nothing.
