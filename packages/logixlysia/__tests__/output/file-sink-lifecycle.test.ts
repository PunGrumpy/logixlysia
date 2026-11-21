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
