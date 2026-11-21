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
import { setImmediate as nextTurn } from 'node:timers/promises'
import { gunzipSync } from 'node:zlib'
import {
  closeAllFileSinks,
  flushAllFileSinks,
  getFileSink
} from '../../src/output/file-sink'
import type { FileSink, FileSinkOptions } from '../../src/output/file-sink'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const writeSequentially = async (
  sink: FileSink,
  count: number,
  options: FileSinkOptions
): Promise<void> => {
  if (count === 0) {
    return
  }
  await sink.write('a\n', options)
  await writeSequentially(sink, count - 1, options)
}

interface Gate {
  /** Runs `react` once the held call has settled and its caller resumed. */
  afterCall: (react: () => void) => void
  /**
   * Resolves once a call is held at the gate. Rejects as soon as
   * `operation`, the work that should make that call, fails or finishes
   * without making it, so a broken setup fails fast instead of hanging.
   */
  reachedBy: (operation: Promise<unknown>) => Promise<void>
  release: () => void
}

interface HeldCall {
  opened: Promise<void>
  reach: (call: Promise<unknown>) => void
}

const createGate = (): { gate: Gate; held: HeldCall } => {
  const opened: PromiseWithResolvers<void> = Promise.withResolvers()
  const reached: PromiseWithResolvers<void> = Promise.withResolvers()
  let heldCall: Promise<unknown> | null = null
  const gate: Gate = {
    afterCall: react => {
      heldCall?.then(react, react)
    },
    reachedBy: async operation => {
      const finished = operation.then(() => {
        if (heldCall === null) {
          throw new Error('the operation finished without reaching the gate')
        }
      })
      await Promise.race([reached.promise, finished])
    },
    release: opened.resolve
  }
  const held: HeldCall = {
    opened: opened.promise,
    reach: call => {
      heldCall = call
      reached.resolve()
    }
  }
  return { gate, held }
}

interface HandleTracker {
  holdNextClose: () => Gate
  holdNextWrite: () => Gate
  openDescriptors: () => number[]
  restore: () => void
}

// Records every FileHandle the sink writes through. A closed FileHandle
// reports fd -1, so any other fd is a descriptor still open. holdNextWrite()
// and holdNextClose() stall one call the way a slow disk would, so a test
// can act while it is in flight.
const trackWrittenHandles = async (dir: string): Promise<HandleTracker> => {
  const probe = await open(path.join(dir, 'probe'), 'a')
  const prototype = Object.getPrototypeOf(probe) as FileHandle
  await probe.close()
  const { close: originalClose, write: originalWrite } = prototype
  const handles = new Set<FileHandle>()
  let heldWrite: HeldCall | null = null
  let heldClose: HeldCall | null = null

  const callThrough = (
    handle: FileHandle,
    original: (...args: never[]) => unknown,
    args: unknown[],
    held: HeldCall | null
  ): Promise<unknown> => {
    const call = (async () => {
      if (held) {
        await held.opened
      }
      return await Reflect.apply(original, handle, args)
    })()
    held?.reach(call)
    return call
  }

  const writeSpy = spyOn(prototype, 'write').mockImplementation(
    function recordHandle(this: FileHandle, ...args: unknown[]) {
      handles.add(this)
      const held = heldWrite
      heldWrite = null
      return callThrough(this, originalWrite, args, held)
    } as FileHandle['write']
  )
  const closeSpy = spyOn(prototype, 'close').mockImplementation(
    function holdClose(this: FileHandle) {
      const held = heldClose
      heldClose = null
      return callThrough(this, originalClose, [], held)
    } as FileHandle['close']
  )
  return {
    holdNextClose: () => {
      const { gate, held } = createGate()
      heldClose = held
      return gate
    },
    holdNextWrite: () => {
      const { gate, held } = createGate()
      heldWrite = held
      return gate
    },
    openDescriptors: () =>
      [...handles].map(handle => handle.fd).filter(fd => fd !== -1),
    restore: () => {
      writeSpy.mockRestore()
      closeSpy.mockRestore()
    }
  }
}

// A line written while a close is held up either queues behind the close on
// the closing sink or goes to a sink of its own. In the second case it can
// reach the disk first, so wait for that before the held write goes on.
const letLateLinesLand = async (
  closing: FileSink,
  lateSink: FileSink,
  landed: Promise<unknown>
): Promise<void> => {
  if (lateSink !== closing) {
    await landed
  }
}

const writeLines = (
  sink: FileSink,
  lines: string[],
  options: FileSinkOptions
): Promise<void>[] => lines.map(line => sink.write(`${line}\n`, options))

const readLines = async (filePath: string): Promise<string[]> => {
  const raw = await readFile(filePath)
  const text = filePath.endsWith('.gz')
    ? gunzipSync(raw).toString('utf-8')
    : raw.toString('utf-8')
  return text.split('\n').filter(Boolean)
}

const readArchives = async (filePath: string): Promise<string[][]> => {
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const entries = await readdir(dir)
  const names = entries.filter(name => name.startsWith(`${base}.`)).toSorted()
  return await Promise.all(names.map(name => readLines(path.join(dir, name))))
}

const readLiveLines = async (filePath: string): Promise<string[]> => {
  try {
    return await readLines(filePath)
  } catch {
    return []
  }
}

describe('file sink lifecycle', () => {
  test('flush() resolves after a write issued in the same tick is on disk', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'flush.log')
      const sink = getFileSink(filePath)

      sink.write('same-tick\n', {})
      await sink.flush()

      expect(await readFile(filePath, 'utf-8')).toContain('same-tick')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('close() releases the handle and a later write reopens the file', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'close.log')
      const first = getFileSink(filePath)

      await first.write('before-close\n', {})
      await first.close()

      const second = getFileSink(filePath)
      expect(second).not.toBe(first)

      second.write('after-close\n', {})
      await second.flush()

      const contents = await readFile(filePath, 'utf-8')
      expect(contents).toContain('before-close')
      expect(contents).toContain('after-close')
    } finally {
      await removeTempDir(dir)
    }
  })

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

  test.each([true, false])(
    'a rotation during close() keeps every line in place (compress: %p)',
    async compress => {
      const dir = await createTempDir()
      const tracker = await trackWrittenHandles(dir)
      const gate = tracker.holdNextWrite()
      try {
        const filePath = path.join(dir, 'logs', 'close-rotate.log')
        const options = { logRotation: { compress, maxSize: 64 } }
        const before = Array.from({ length: 8 }, (_, i) => `before-${i}`)
        const during = ['during-0', 'during-1']
        const sink = getFileSink(filePath)

        const beforeWrites = writeLines(sink, before, options)
        await gate.reachedBy(Promise.all(beforeWrites))
        const closing = sink.close()
        const lateSink = getFileSink(filePath)
        const duringWrites = writeLines(lateSink, during, options)
        await letLateLinesLand(sink, lateSink, Promise.all(duringWrites))
        gate.release()
        await closing
        await Promise.all([...beforeWrites, ...duringWrites])
        await getFileSink(filePath).write('after\n', options)
        await closeAllFileSinks()

        const archives = await readArchives(filePath)
        const live = await readLiveLines(filePath)
        expect([...archives.flat(), ...live].toSorted()).toEqual(
          [...before, ...during, 'after'].toSorted()
        )
        expect(archives).toEqual([before])
        expect(live).toEqual([...during, 'after'])
        expect(tracker.openDescriptors()).toEqual([])
      } finally {
        gate.release()
        tracker.restore()
        await closeAllFileSinks()
        await removeTempDir(dir)
      }
    }
  )

  test('lines written before, during and after close() keep their order', async () => {
    const dir = await createTempDir()
    const tracker = await trackWrittenHandles(dir)
    const gate = tracker.holdNextWrite()
    try {
      const filePath = path.join(dir, 'logs', 'close-order.log')
      const sink = getFileSink(filePath)

      const beforeWrites = writeLines(sink, ['before-0', 'before-1'], {})
      await gate.reachedBy(Promise.all(beforeWrites))
      const closing = sink.close()
      const lateSink = getFileSink(filePath)
      const duringWrites = writeLines(lateSink, ['during-0', 'during-1'], {})
      await letLateLinesLand(sink, lateSink, Promise.all(duringWrites))
      gate.release()
      await closing
      await Promise.all([...beforeWrites, ...duringWrites])
      await getFileSink(filePath).write('after\n', {})
      await closeAllFileSinks()

      expect(await readLines(filePath)).toEqual([
        'before-0',
        'before-1',
        'during-0',
        'during-1',
        'after'
      ])
    } finally {
      gate.release()
      tracker.restore()
      await closeAllFileSinks()
      await removeTempDir(dir)
    }
  })

  test('flushAllFileSinks() waits for a sink that is closing', async () => {
    const dir = await createTempDir()
    const tracker = await trackWrittenHandles(dir)
    const gate = tracker.holdNextWrite()
    try {
      const filePath = path.join(dir, 'logs', 'close-flush.log')
      const sink = getFileSink(filePath)

      const first = sink.write('first\n', {})
      await gate.reachedBy(first)
      const closing = sink.close()
      const lateSink = getFileSink(filePath)
      const second = lateSink.write('second\n', {})
      const onDiskAfterFlush = flushAllFileSinks().then(
        async () => await readFile(filePath, 'utf-8')
      )
      await letLateLinesLand(sink, lateSink, onDiskAfterFlush)
      gate.release()

      expect(await onDiskAfterFlush).toBe('first\nsecond\n')
      await Promise.all([first, second, closing])
    } finally {
      gate.release()
      tracker.restore()
      await closeAllFileSinks()
      await removeTempDir(dir)
    }
  })

  test('a write issued as the handle finishes closing keeps the sink registered', async () => {
    const dir = await createTempDir()
    const tracker = await trackWrittenHandles(dir)
    const gate = tracker.holdNextClose()
    try {
      const filePath = path.join(dir, 'logs', 'close-pending.log')
      const sink = getFileSink(filePath)
      await sink.write('before-close\n', {})

      const closing = sink.close()
      await gate.reachedBy(closing)
      let late: Promise<void> = Promise.resolve()
      // Runs once the handle is closed and before close() decides whether
      // the sink is idle, while the line is still a batch waiting to chain.
      gate.afterCall(() => {
        late = getFileSink(filePath).write('late\n', {})
      })
      gate.release()
      await closing
      await late

      expect(getFileSink(filePath)).toBe(sink)
      await closeAllFileSinks()
      expect(tracker.openDescriptors()).toEqual([])
      expect(await readFile(filePath, 'utf-8')).toBe('before-close\nlate\n')
    } finally {
      gate.release()
      tracker.restore()
      await closeAllFileSinks()
      await removeTempDir(dir)
    }
  })

  test('flushAllFileSinks() waits for a close that is still releasing the handle', async () => {
    const dir = await createTempDir()
    const tracker = await trackWrittenHandles(dir)
    const gate = tracker.holdNextClose()
    try {
      const filePath = path.join(dir, 'logs', 'close-held.log')
      const sink = getFileSink(filePath)
      await sink.write('line\n', {})

      const closing = sink.close()
      await gate.reachedBy(closing)
      let flushed = false
      const flushing = flushAllFileSinks().then(() => {
        flushed = true
      })
      // A flush that does not wait for the close settles within microtasks,
      // so one turn of the event loop is enough to catch it.
      await nextTurn()
      expect(flushed).toBe(false)

      gate.release()
      await flushing
      expect(tracker.openDescriptors()).toEqual([])
      await closing
    } finally {
      gate.release()
      tracker.restore()
      await closeAllFileSinks()
      await removeTempDir(dir)
    }
  })

  test('close() is idempotent', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'idempotent.log')
      const sink = getFileSink(filePath)

      await sink.write('once\n', {})
      await sink.close()
      await sink.close()

      expect(await readFile(filePath, 'utf-8')).toContain('once')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('flushAllFileSinks() drains every registered sink', async () => {
    const dir = await createTempDir()
    try {
      const firstPath = path.join(dir, 'logs', 'all-1.log')
      const secondPath = path.join(dir, 'logs', 'all-2.log')

      getFileSink(firstPath).write('first\n', {})
      getFileSink(secondPath).write('second\n', {})
      await flushAllFileSinks()

      expect(await readFile(firstPath, 'utf-8')).toContain('first')
      expect(await readFile(secondPath, 'utf-8')).toContain('second')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('relative and absolute spellings of one path share a single sink', async () => {
    const dir = await createTempDir()
    const abs = path.join(dir, 'logs', 'same.log')
    const rel = path.relative(process.cwd(), abs)
    const sink = getFileSink(abs)
    try {
      expect(getFileSink(rel)).toBe(sink)

      sink.write('via-absolute\n', {})
      getFileSink(rel).write('via-relative\n', {})
      await flushAllFileSinks()

      const contents = await readFile(abs, 'utf-8')
      const lines = contents.split('\n').filter(Boolean)
      expect(lines.toSorted()).toEqual(['via-absolute', 'via-relative'])
    } finally {
      await sink.close()
      await removeTempDir(dir)
    }
  })

  test.skipIf(process.getuid?.() === 0)(
    'a failed size rotation is retried after another maxSize, not on every batch',
    async () => {
      const dir = await createTempDir()
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'flood.log')
      await mkdir(logsDir)
      await writeFile(filePath, 'x'.repeat(2048))
      await chmod(logsDir, 0o500)
      const sink = getFileSink(filePath)
      const onRotationError = mock((_error: unknown) => {})
      try {
        const options = {
          logRotation: { compress: false, maxSize: '1k' },
          onRotationError
        }
        await writeSequentially(sink, 5, options)

        expect(onRotationError).toHaveBeenCalledTimes(1)
      } finally {
        await chmod(logsDir, 0o700)
        await sink.close()
        await removeTempDir(dir)
      }
    }
  )

  test('a size rotation rolls the file over once it passes maxSize', async () => {
    const dir = await createTempDir()
    const filePath = path.join(dir, 'logs', 'roll.log')
    const sink = getFileSink(filePath)
    try {
      await sink.write('x'.repeat(2048), {})
      await sink.write('next\n', {
        logRotation: { compress: false, maxSize: '1k' }
      })
      await sink.flush()

      const entries = await readdir(path.join(dir, 'logs'))
      const rotated = entries.filter(name => name !== 'roll.log')
      expect(rotated).toHaveLength(1)
      const archived = await readFile(
        path.join(dir, 'logs', rotated[0] ?? ''),
        'utf-8'
      )
      expect(archived).toBe(`${'x'.repeat(2048)}next\n`)
    } finally {
      await sink.close()
      await removeTempDir(dir)
    }
  })
})
