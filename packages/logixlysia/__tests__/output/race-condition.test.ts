import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const MESSAGE_REGEX = /message-(?<id>\d+)/u
const EXCLUSION_LINE_REGEX =
  /^(?:DEBUG|INFO|WARNING|ERROR) [\d.]+ms GET \/test\d+ msg-(?<id>\d+)-x+$/u

describe('logToFile race condition', () => {
  test('handles concurrent writes during rotation without data loss', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'concurrent.log')
      const options: Options = {
        config: {
          logRotation: { compress: false, maxSize: 100 }
        }
      }

      const writes = Array.from({ length: 50 }, (_, i) => {
        const request = createMockRequest(`http://localhost/test${i}`)
        return logToFile({
          data: { message: `message-${i}-${'x'.repeat(20)}` },
          filePath,
          level: 'INFO',
          options,
          precomputed: precomputedFor(request),
          request,
          store: { beforeTime: 0n }
        })
      })

      await Promise.all(writes)

      const files = await fs.readdir(path.join(dir, 'logs'))
      const logFiles = files.filter(
        name => name === 'concurrent.log' || name.startsWith('concurrent.log.')
      )

      let totalLines = 0
      const allMessages = new Set<string>()

      const contents = await Promise.all(
        logFiles.map(file => fs.readFile(path.join(dir, 'logs', file), 'utf-8'))
      )
      for (const content of contents) {
        const lines = content.split('\n').filter(l => l.length > 0)
        totalLines += lines.length

        for (const line of lines) {
          const match = line.match(MESSAGE_REGEX)
          if (match) {
            allMessages.add(match[1])
          }
        }
      }

      expect(allMessages.size).toBe(50)
      expect(totalLines).toBe(50)

      for (let i = 0; i < 50; i += 1) {
        expect(allMessages.has(String(i))).toBe(true)
      }
    } finally {
      await removeTempDir(dir)
    }
  })

  test('serializes rotation operations to prevent file conflicts', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'serialize.log')
      const options: Options = {
        config: {
          logRotation: { compress: false, maxSize: 1 }
        }
      }

      const writes = Array.from({ length: 20 }, (_, i) => {
        const request = createMockRequest(`http://localhost/test${i}`)
        return logToFile({
          data: { message: `msg-${i}-${'x'.repeat(100)}` },
          filePath,
          level: 'INFO',
          options,
          precomputed: precomputedFor(request),
          request,
          store: { beforeTime: 0n }
        })
      })

      await expect(Promise.all(writes)).resolves.toBeDefined()

      const files = await fs.readdir(path.join(dir, 'logs'))
      let totalEntries = 0

      const contents = await Promise.all(
        files.map(file => fs.readFile(path.join(dir, 'logs', file), 'utf-8'))
      )
      for (const content of contents) {
        const lines = content.split('\n').filter(l => l.length > 0)
        totalEntries += lines.length
      }

      expect(totalEntries).toBe(20)
    } finally {
      await removeTempDir(dir)
    }
  })

  test('same-tick logToFile calls to one path never interleave writes', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'exclusion.log')
      const options: Options = {
        config: {
          logRotation: { compress: false, maxSize: 1 }
        }
      }

      const total = 20

      const writes = Array.from({ length: total }, (_, i) => {
        const request = createMockRequest(`http://localhost/test${i}`)
        return logToFile({
          data: { message: `msg-${i}-${'x'.repeat(50)}` },
          filePath,
          level: 'INFO',
          options,
          precomputed: precomputedFor(request),
          request,
          store: { beforeTime: 0n }
        })
      })

      await Promise.all(writes)

      const files = await fs.readdir(path.join(dir, 'logs'))
      const logFiles = files.filter(
        name => name === 'exclusion.log' || name.startsWith('exclusion.log.')
      )

      let totalLines = 0
      const seenIds = new Set<string>()

      const contents = await Promise.all(
        logFiles.map(file => fs.readFile(path.join(dir, 'logs', file), 'utf-8'))
      )
      for (const content of contents) {
        const lines = content.split('\n').filter(l => l.length > 0)
        totalLines += lines.length

        for (const line of lines) {
          expect(line).toMatch(EXCLUSION_LINE_REGEX)
          const match = line.match(EXCLUSION_LINE_REGEX)
          if (match) {
            seenIds.add(match[1])
          }
        }
      }

      expect(totalLines).toBe(total)
      expect(seenIds.size).toBe(total)
    } finally {
      await removeTempDir(dir)
    }
  })
})
