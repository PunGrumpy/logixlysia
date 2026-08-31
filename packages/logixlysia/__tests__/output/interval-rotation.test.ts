import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { resolveOpenedAt } from '../../src/output/file-sink'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const ONE_HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * ONE_HOUR_MS

describe('interval rotation', () => {
  afterEach(() => {
    // Always reset the faked clock so it never leaks into other test files.
    setSystemTime()
  })

  test('rotates on the first write after the interval elapses', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'interval.log')
      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }

      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const logsDir = join(dir, 'logs')
      const entriesAfterSecond = await fs.readdir(logsDir)
      const rotated = entriesAfterSecond.filter(name =>
        name.startsWith('interval.log.')
      )
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toContain('msg-1')
      expect(rotatedContent).toContain('msg-2')

      // Reset to the real clock before the next write: the rotated-away
      // file's replacement gets a real (post-rotation) birthtime, so this
      // write must not immediately trip the interval again.
      setSystemTime()

      await logToFile({
        data: { message: 'msg-3' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/third'),
        store: { beforeTime: BigInt(0) }
      })

      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('msg-3')
      expect(liveContent).not.toContain('msg-1')
      expect(liveContent).not.toContain('msg-2')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('does not rotate before the interval elapses', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'no-rotate.log')
      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }

      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const logsDir = join(dir, 'logs')
      const entries = await fs.readdir(logsDir)
      expect(entries).toEqual(['no-rotate.log'])

      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('msg-1')
      expect(content).toContain('msg-2')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('maxSize fires first when both triggers are configured', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'both-size.log')
      const options: Options = {
        config: { logRotation: { interval: '1w', maxSize: 50 } }
      }

      await logToFile({
        data: { message: 'x'.repeat(60) },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      const logsDir = join(dir, 'logs')
      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('both-size.log.'))
      expect(rotated.length).toBe(1)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('interval fires first when both triggers are configured', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'both-interval.log')
      const options: Options = {
        config: { logRotation: { interval: '1h', maxSize: 10_000_000 } }
      }

      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const logsDir = join(dir, 'logs')
      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name =>
        name.startsWith('both-interval.log.')
      )
      expect(rotated.length).toBe(1)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('restart simulation: birthtime survives, fresh sink rotates immediately', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = join(dir, 'logs')
      const filePath = join(logsDir, 'restart.log')
      await fs.mkdir(logsDir, { recursive: true })
      // Seed the file directly (no sink involved), so its birthtime is the
      // real filesystem creation time — simulating a file left over from a
      // previous process.
      await fs.writeFile(filePath, 'seed\n')

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }
      await logToFile({
        data: { message: 'after-restart' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('restart.log.'))
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toContain('seed')
      expect(rotatedContent).toContain('after-restart')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('idle process does not rotate until the next write', async () => {
    // Documents the accepted idle-process tradeoff from
    // plans/spikes/021-interval-rotation-decision.md: a process that writes
    // no logs for longer than `interval` does not rotate until the next
    // write arrives.
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'idle.log')
      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }

      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      // No write happens here — just wait one macrotask so any (nonexistent)
      // background rotation would have had a chance to run.
      await new Promise(resolve => setTimeout(resolve, 10))

      const logsDir = join(dir, 'logs')
      const idleEntries = await fs.readdir(logsDir)
      expect(idleEntries).toEqual(['idle.log'])

      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const afterWriteEntries = await fs.readdir(logsDir)
      const rotated = afterWriteEntries.filter(name =>
        name.startsWith('idle.log.')
      )
      expect(rotated.length).toBe(1)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('resolveOpenedAt falls back to now when birthtimeMs is 0 or absent', () => {
    expect(resolveOpenedAt(0, 123)).toBe(123)
    expect(resolveOpenedAt(undefined, 123)).toBe(123)
    expect(resolveOpenedAt(456, 123)).toBe(456)
  })
})
