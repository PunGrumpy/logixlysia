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
})
