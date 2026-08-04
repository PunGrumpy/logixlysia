import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

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
      expect(fileStat.mode & 0o777).toBe(0o600)
      expect(dirStat.mode & 0o777).toBe(0o700)
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
      expect(fileStat.mode & 0o777).toBe(0o644)
    } finally {
      await removeTempDir(dir)
    }
  })
})
