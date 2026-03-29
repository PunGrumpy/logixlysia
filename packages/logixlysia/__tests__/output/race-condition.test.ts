import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

describe('logToFile race condition', () => {
  test('handles concurrent writes during rotation without data loss', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'concurrent.log')
      const options: Options = {
        config: {
          // Very small size to trigger rotation quickly
          logRotation: { maxSize: 100, compress: false }
        }
      }

      // Create 50 concurrent write operations
      const writes = Array.from({ length: 50 }, (_, i) =>
        logToFile({
          filePath,
          level: 'INFO',
          request: createMockRequest(`http://localhost/test${i}`),
          data: { message: `message-${i}-${'x'.repeat(20)}` },
          store: { beforeTime: BigInt(0) },
          options
        })
      )

      // Wait for all writes to complete
      await Promise.all(writes)

      // Read all log files (original + rotated)
      const files = await fs.readdir(join(dir, 'logs'))
      const logFiles = files.filter(
        name => name === 'concurrent.log' || name.startsWith('concurrent.log.')
      )

      let totalLines = 0
      const allMessages = new Set<string>()

      for (const file of logFiles) {
        const content = await fs.readFile(join(dir, 'logs', file), 'utf-8')
        const lines = content.split('\n').filter(l => l.length > 0)
        totalLines += lines.length

        // Extract message numbers from each line
        for (const line of lines) {
          const match = line.match(/message-(\d+)/)
          if (match) {
            allMessages.add(match[1])
          }
        }
      }

      // All 50 messages should be present (no data loss)
      expect(allMessages.size).toBe(50)
      expect(totalLines).toBe(50)

      // Verify all message IDs from 0-49 are present
      for (let i = 0; i < 50; i++) {
        expect(allMessages.has(String(i))).toBe(true)
      }
    } finally {
      await removeTempDir(dir)
    }
  })

  test('serializes rotation operations to prevent file conflicts', async () => {
    const dir = await createTempDir()
    try {
      const filePath = join(dir, 'logs', 'serialize.log')
      const options: Options = {
        config: {
          // Trigger rotation on every write
          logRotation: { maxSize: 1, compress: false }
        }
      }

      // Create 20 writes that should all trigger rotation
      const writes = Array.from({ length: 20 }, (_, i) =>
        logToFile({
          filePath,
          level: 'INFO',
          request: createMockRequest(`http://localhost/test${i}`),
          data: { message: `msg-${i}-${'x'.repeat(100)}` },
          store: { beforeTime: BigInt(0) },
          options
        })
      )

      // This should not throw errors or lose data
      await expect(Promise.all(writes)).resolves.toBeDefined()

      // Count total log entries across all files
      const files = await fs.readdir(join(dir, 'logs'))
      let totalEntries = 0

      for (const file of files) {
        const content = await fs.readFile(join(dir, 'logs', file), 'utf-8')
        const lines = content.split('\n').filter(l => l.length > 0)
        totalEntries += lines.length
      }

      // All 20 entries should be preserved
      expect(totalEntries).toBe(20)
    } finally {
      await removeTempDir(dir)
    }
  })
})
