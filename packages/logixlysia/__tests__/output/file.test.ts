import { describe, expect, mock, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Options, SinkErrorContext } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

/** Owner/group/other permission bits as a 3-digit octal string, e.g. '600'. */
const permBits = (mode: number): string => mode.toString(8).slice(-3)

const MESSAGE_ID_REGEX = /msg-(\d+)$/

describe('logToFile', () => {
  test('writes to file and creates directories', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'app.log')
      const options: Options = { config: {} }

      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: BigInt(0) }
      })

      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('hello')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('rotates and compresses when configured', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'rotate.log')
      const options: Options = {
        config: {
          logRotation: { compress: true, compression: 'gzip', maxSize: 1 }
        }
      }

      await logToFile({
        data: { message: 'x'.repeat(50) },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: BigInt(0) }
      })

      const files = await fs.readdir(join(dir, 'logs'))
      const hasGz = files.some(
        name => name.startsWith('rotate.log.') && name.endsWith('.gz')
      )
      expect(hasGz).toBe(true)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('includes query parameters when enabled', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'query.log')
      const options: Options = {
        config: { logQueryParams: true }
      }

      await logToFile({
        data: { message: 'msg' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/api/test?user=123'),
        store: { beforeTime: BigInt(0) }
      })

      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toContain('/api/test?user=123')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('sanitizes newlines in message to prevent log-line injection', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'inject.log')
      const options: Options = { config: {} }

      await logToFile({
        data: { message: 'line1\nFAKE INFO line2' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: BigInt(0) }
      })

      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(line => line.length > 0)
      expect(lines.length).toBe(1)
      expect(content).toContain('line1\\nFAKE INFO line2')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('creates log files with 0600 mode and directories with 0700 mode by default', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'perms.log')
      const options: Options = { config: {} }

      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: BigInt(0) }
      })

      const fileStat = await fs.stat(filePath)
      const dirStat = await fs.stat(dirname(filePath))
      expect(permBits(fileStat.mode)).toBe('600')
      expect(permBits(dirStat.mode)).toBe('700')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('honors a configured logFileMode', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'custom-mode.log')
      const options: Options = { config: { logFileMode: 0o644 } }

      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/test'),
        store: { beforeTime: BigInt(0) }
      })

      const fileStat = await fs.stat(filePath)
      expect(permBits(fileStat.mode)).toBe('644')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('coalesces same-tick writes into one file with all lines intact', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'batch.log')
      const options: Options = { config: {} }
      const total = 50

      // No awaits between calls: all 50 land in the same microtask batch.
      const writes = Array.from({ length: total }, (_, i) =>
        logToFile({
          data: { message: `msg-${i}` },
          filePath,
          level: 'INFO',
          options,
          request: createMockRequest(`http://localhost/test${i}`),
          store: { beforeTime: BigInt(0) }
        })
      )

      // Every caller's own promise must resolve, proving per-caller
      // resolution semantics survive batching.
      await Promise.all(writes)

      const content = await fs.readFile(filePath, 'utf-8')
      const lines = content.split('\n').filter(line => line.length > 0)
      expect(lines.length).toBe(total)

      const seenIds = new Set<string>()
      for (const line of lines) {
        const match = line.match(MESSAGE_ID_REGEX)
        expect(match).not.toBeNull()
        if (match) {
          seenIds.add(match[1])
        }
      }
      expect(seenIds.size).toBe(total)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('rotates on size and resumes writing into a fresh live file', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'reopen.log')
      const options: Options = {
        config: { logRotation: { maxSize: 100 } }
      }

      // This single line already exceeds maxSize, so it rotates on its own.
      await logToFile({
        data: { message: 'x'.repeat(90) },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      // Small enough to stay under maxSize: proves the live file was
      // reopened and writes keep landing in it (not the rotated one).
      await logToFile({
        data: { message: 'y' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const entries = await fs.readdir(join(dir, 'logs'))
      const rotated = entries.filter(name => name.startsWith('reopen.log.'))
      expect(rotated.length).toBe(1)

      const rotatedContent = await fs.readFile(
        join(dir, 'logs', rotated[0]),
        'utf-8'
      )
      expect(rotatedContent).toContain('x'.repeat(90))

      const liveContent = await fs.readFile(filePath, 'utf-8')
      expect(liveContent).toContain('/second y')
      expect(liveContent).not.toContain('x'.repeat(90))
    } finally {
      await removeTempDir(dir)
    }
  })

  test('does not re-rotate immediately after the byte counter resets', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'no-leak.log')
      const options: Options = {
        config: { logRotation: { maxSize: 100 } }
      }

      // Triggers rotation on its own.
      await logToFile({
        data: { message: 'x'.repeat(90) },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })

      // Two small writes after the reset: if bytesWritten leaked across the
      // rotation instead of resetting to 0, these would spuriously rotate
      // again.
      await logToFile({
        data: { message: 'a' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })
      await logToFile({
        data: { message: 'b' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/third'),
        store: { beforeTime: BigInt(0) }
      })

      const entries = await fs.readdir(join(dir, 'logs'))
      const rotated = entries.filter(name => name.startsWith('no-leak.log.'))
      expect(rotated.length).toBe(1)

      const liveContent = await fs.readFile(filePath, 'utf-8')
      const lines = liveContent.split('\n').filter(line => line.length > 0)
      expect(lines.length).toBe(2)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('reopened file after rotation keeps the configured mode', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'mode-after-rotate.log')
      const options: Options = {
        config: { logRotation: { maxSize: 50 } }
      }

      await logToFile({
        data: { message: 'x'.repeat(60) },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/first'),
        store: { beforeTime: BigInt(0) }
      })
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        request: createMockRequest('http://localhost/second'),
        store: { beforeTime: BigInt(0) }
      })

      const fileStat = await fs.stat(filePath)
      expect(permBits(fileStat.mode)).toBe('600')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('invokes config.onError with sink "file" when the write fails, and swallows a throwing hook', async () => {
    const dir = await createTempDir()
    try {
      // A regular file where a directory is expected: mkdir(..., {recursive:
      // true}) fails with ENOTDIR, giving a deterministic, permission-model-
      // independent write failure.
      const blocker = join(dir, 'not-a-directory')
      await fs.writeFile(blocker, 'x')
      const filePath = join(blocker, 'nested', 'app.log')

      const onError = mock((_context: SinkErrorContext) => {
        throw new Error('hook boom')
      })
      const options: Options = { config: { onError } }

      // The hook throwing must not crash the caller; logToFile still
      // rejects with the original error (callers already .catch() this).
      await expect(
        logToFile({
          data: { message: 'hello' },
          filePath,
          level: 'INFO',
          options,
          request: createMockRequest('http://localhost/test'),
          store: { beforeTime: BigInt(0) }
        })
      ).rejects.toBeDefined()

      expect(onError).toHaveBeenCalledTimes(1)
      const [context] = onError.mock.calls[0] ?? [undefined]
      expect(context?.sink).toBe('file')
      expect(context?.error).toBeDefined()
    } finally {
      await removeTempDir(dir)
    }
  })
})
