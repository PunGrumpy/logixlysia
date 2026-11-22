import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { resolveOpenedAt } from '../../src/output/file-sink'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { sleep } from '../_helpers/sleep'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const ONE_HOUR_MS = 60 * 60 * 1000
const TWO_HOURS_MS = 2 * ONE_HOUR_MS

const restoreRealClock = (): void => {
  setSystemTime()
}

describe('interval rotation', () => {
  afterEach(() => {
    restoreRealClock()
  })

  test('the first line after the interval elapses opens the new file', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'interval.log')
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
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const logsDir = path.join(dir, 'logs')
      const entriesAfterSecond = await fs.readdir(logsDir)
      const rotated = entriesAfterSecond.filter(name =>
        name.startsWith('interval.log.')
      )
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toContain('msg-1')
      expect(rotatedContent).not.toContain('msg-2')

      restoreRealClock()

      const thirdRequest = createMockRequest('http://localhost/third')
      await logToFile({
        data: { message: 'msg-3' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(thirdRequest),
        request: thirdRequest,
        store: { beforeTime: 0n }
      })

      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).not.toContain('msg-1')
      expect(liveContent).toContain('msg-2')
      expect(liveContent).toContain('msg-3')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('does not rotate before the interval elapses', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'no-rotate.log')
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
      const secondRequest = createMockRequest('http://localhost/second')
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const logsDir = path.join(dir, 'logs')
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
      const filePath = path.join(dir, 'logs', 'both-size.log')
      const options: Options = {
        config: { logRotation: { interval: '1w', maxSize: 50 } }
      }

      const request = createMockRequest('http://localhost/first')
      await logToFile({
        data: { message: 'x'.repeat(60) },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const logsDir = path.join(dir, 'logs')
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
      const filePath = path.join(dir, 'logs', 'both-interval.log')
      const options: Options = {
        config: { logRotation: { interval: '1h', maxSize: 10_000_000 } }
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
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const logsDir = path.join(dir, 'logs')
      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name =>
        name.startsWith('both-interval.log.')
      )
      expect(rotated.length).toBe(1)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('restart simulation: birthtime survives, the old file rotates before the first write', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'restart.log')
      await fs.mkdir(logsDir, { recursive: true })
      await fs.writeFile(filePath, 'seed\n')

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }
      const request = createMockRequest('http://localhost/first')
      await logToFile({
        data: { message: 'after-restart' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('restart.log.'))
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toBe('seed\n')

      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('after-restart')
    } finally {
      await removeTempDir(dir)
    }
  })

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

  test('idle process does not rotate until the next write', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'idle.log')
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

      await sleep(10)

      const logsDir = path.join(dir, 'logs')
      const idleEntries = await fs.readdir(logsDir)
      expect(idleEntries).toEqual(['idle.log'])

      const secondRequest = createMockRequest('http://localhost/second')
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
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

  test('an expired empty file starts a new period instead of archiving the next line', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'empty.log')
      await fs.mkdir(logsDir, { recursive: true })
      await fs.writeFile(filePath, '')

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

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
      const secondRequest = createMockRequest('http://localhost/second')
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const entries = await fs.readdir(logsDir)
      expect(entries.filter(name => name.startsWith('empty.log.'))).toEqual([])
      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('msg-1')
      expect(liveContent).toContain('msg-2')

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))
      const thirdRequest = createMockRequest('http://localhost/third')
      await logToFile({
        data: { message: 'msg-3' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(thirdRequest),
        request: thirdRequest,
        store: { beforeTime: 0n }
      })

      const after = await fs.readdir(logsDir)
      const rotated = after.filter(name => name.startsWith('empty.log.'))
      expect(rotated).toHaveLength(1)
      const archived = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(archived).toContain('msg-1')
      expect(archived).toContain('msg-2')
      expect(archived).not.toContain('msg-3')
      const liveAfter = await fs.readFile(filePath, 'utf-8')
      expect(liveAfter).toContain('msg-3')
      expect(liveAfter).not.toContain('msg-1')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('time retention removes the archive of a file that was last written before maxFiles', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'retain.log')
      const options: Options = {
        config: { logRotation: { interval: '1h', maxFiles: '1d' } }
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

      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000)
      await fs.utimes(filePath, twoDaysAgo, twoDaysAgo)
      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      const secondRequest = createMockRequest('http://localhost/second')
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('retain.log.'))
      expect(rotated).toEqual([])
      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('msg-2')
      expect(liveContent).not.toContain('msg-1')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('time retention keeps the archive of a file that was written within maxFiles', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'retain.log')
      const options: Options = {
        config: { logRotation: { interval: '1h', maxFiles: '1d' } }
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
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      const entries = await fs.readdir(logsDir)
      const rotated = entries.filter(name => name.startsWith('retain.log.'))
      expect(rotated).toHaveLength(1)
      const archived = await fs.readFile(
        path.join(logsDir, rotated[0]),
        'utf-8'
      )
      expect(archived).toContain('msg-1')
      expect(archived).not.toContain('msg-2')
      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('msg-2')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('an expired empty symlink stays a symlink', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const target = path.join(logsDir, 'target.log')
      const filePath = path.join(logsDir, 'link.log')
      await fs.mkdir(logsDir, { recursive: true })
      await fs.writeFile(target, '')
      await fs.symlink(target, filePath)

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))

      const options: Options = {
        config: { logRotation: { interval: '1h' } }
      }
      const request = createMockRequest('http://localhost/first')
      await logToFile({
        data: { message: 'msg-1' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const linkStat = await fs.lstat(filePath)
      expect(linkStat.isSymbolicLink()).toBe(true)
      expect(await fs.readFile(filePath, 'utf-8')).toContain('msg-1')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('replacing the path does not delete the file now at that path', async () => {
    const dir = await createTempDir()
    try {
      const logsDir = path.join(dir, 'logs')
      const filePath = path.join(logsDir, 'live.log')
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

      await fs.truncate(filePath, 0)
      const aside = path.join(logsDir, 'aside.log')
      await fs.rename(filePath, aside)
      await fs.writeFile(filePath, 'precious')

      setSystemTime(new Date(Date.now() + TWO_HOURS_MS))
      const secondRequest = createMockRequest('http://localhost/second')
      await logToFile({
        data: { message: 'msg-2' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(secondRequest),
        request: secondRequest,
        store: { beforeTime: 0n }
      })

      expect(await fs.readFile(filePath, 'utf-8')).toBe('precious')
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
