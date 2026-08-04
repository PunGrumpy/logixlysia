import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
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
})
