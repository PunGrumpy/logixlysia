import { describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import { permBits } from '../_helpers/perm-bits'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

describe('logDirMode', () => {
  test('creates the log directory with the configured mode', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'dir-mode.log')
      const options: Options = { config: { logDirMode: 0o750 } }

      const request = createMockRequest('http://localhost/test')
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const dirStat = await fs.stat(path.dirname(filePath))
      expect(permBits(dirStat.mode)).toBe('750')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('applies the configured mode to every directory it creates', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'app', 'nested-mode.log')
      const options: Options = { config: { logDirMode: 0o750 } }

      const request = createMockRequest('http://localhost/test')
      await logToFile({
        data: { message: 'hello' },
        filePath,
        level: 'INFO',
        options,
        precomputed: precomputedFor(request),
        request,
        store: { beforeTime: 0n }
      })

      const outer = await fs.stat(path.join(dir, 'logs'))
      const inner = await fs.stat(path.join(dir, 'logs', 'app'))
      expect(permBits(outer.mode)).toBe('750')
      expect(permBits(inner.mode)).toBe('750')
    } finally {
      await removeTempDir(dir)
    }
  })
})
