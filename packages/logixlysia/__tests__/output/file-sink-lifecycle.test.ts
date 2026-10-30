import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { flushAllFileSinks, getFileSink } from '../../src/output/file-sink'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

describe('file sink lifecycle', () => {
  test('flush() resolves after a write issued in the same tick is on disk', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'flush.log')
      const sink = getFileSink(filePath)

      sink.write('same-tick\n', {})
      await sink.flush()

      expect(await readFile(filePath, 'utf-8')).toContain('same-tick')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('close() releases the handle and a later write reopens the file', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'close.log')
      const first = getFileSink(filePath)

      await first.write('before-close\n', {})
      await first.close()

      const second = getFileSink(filePath)
      expect(second).not.toBe(first)

      second.write('after-close\n', {})
      await second.flush()

      const contents = await readFile(filePath, 'utf-8')
      expect(contents).toContain('before-close')
      expect(contents).toContain('after-close')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('close() is idempotent', async () => {
    const dir = await createTempDir()
    try {
      const filePath = path.join(dir, 'logs', 'idempotent.log')
      const sink = getFileSink(filePath)

      await sink.write('once\n', {})
      await sink.close()
      await sink.close()

      expect(await readFile(filePath, 'utf-8')).toContain('once')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('flushAllFileSinks() drains every registered sink', async () => {
    const dir = await createTempDir()
    try {
      const firstPath = path.join(dir, 'logs', 'all-1.log')
      const secondPath = path.join(dir, 'logs', 'all-2.log')

      getFileSink(firstPath).write('first\n', {})
      getFileSink(secondPath).write('second\n', {})
      await flushAllFileSinks()

      expect(await readFile(firstPath, 'utf-8')).toContain('first')
      expect(await readFile(secondPath, 'utf-8')).toContain('second')
    } finally {
      await removeTempDir(dir)
    }
  })

  test('relative and absolute spellings of one path share a single sink', async () => {
    const dir = await createTempDir()
    const abs = path.join(dir, 'logs', 'same.log')
    const rel = path.relative(process.cwd(), abs)
    const sink = getFileSink(abs)
    try {
      expect(getFileSink(rel)).toBe(sink)

      sink.write('via-absolute\n', {})
      getFileSink(rel).write('via-relative\n', {})
      await flushAllFileSinks()

      const contents = await readFile(abs, 'utf-8')
      const lines = contents.split('\n').filter(Boolean)
      expect(lines.toSorted()).toEqual(['via-absolute', 'via-relative'])
    } finally {
      await sink.close()
      await removeTempDir(dir)
    }
  })
})
