import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { getRotatedFileName } from '../../src/output/rotation-manager'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

describe('logToFile', () => {
  test('writes to file and creates directories', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'app.log')
      const options: Options = { config: {} }

      await logToFile({
        filePath,
        level: 'INFO',
        request: createMockRequest('http://localhost/test'),
        data: { message: 'hello' },
        store: { beforeTime: BigInt(0) },
        options
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
          logRotation: { maxSize: 1, compress: true, compression: 'gzip' }
        }
      }

      await logToFile({
        filePath,
        level: 'INFO',
        request: createMockRequest('http://localhost/test'),
        data: { message: 'x'.repeat(50) },
        store: { beforeTime: BigInt(0) },
        options
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

  test('rotates based on interval when a previous rotation is older than the interval', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'interval.log')
      await fs.mkdir(join(dir, 'logs'), { recursive: true })

      // Write content to the log file
      await fs.writeFile(filePath, 'existing log content\n', 'utf-8')

      // Simulate a previous rotation that happened 2 hours ago by creating a
      // rotated file with a timestamp that is clearly in the past.
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const oldRotated = getRotatedFileName(filePath, pastDate)
      await fs.writeFile(oldRotated, 'old rotated content\n', 'utf-8')

      // Configure interval of 1 hour — since the last rotation was 2 hours ago,
      // the next write should trigger a new rotation.
      const options: Options = {
        config: {
          logFilePath: filePath,
          logRotation: { interval: '1h' }
        }
      }

      await logToFile({
        filePath,
        level: 'INFO',
        request: createMockRequest('http://localhost/test'),
        data: { message: 'trigger interval rotation' },
        store: { beforeTime: BigInt(0) },
        options
      })

      const files = await fs.readdir(join(dir, 'logs'))
      // After interval rotation, there should be at least 2 rotated files
      // (the simulated old one plus the newly rotated one).
      const rotatedFiles = files.filter(
        name =>
          name.startsWith('interval.log.') && /\d{4}-\d{2}-\d{2}/.test(name)
      )
      expect(rotatedFiles.length).toBeGreaterThanOrEqual(2)
    } finally {
      await removeTempDir(dir)
    }
  })
})
