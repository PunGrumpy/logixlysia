import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  getRotatedFileName,
  performRotation,
  shouldRotate
} from '../../src/output/rotation-manager'
import { permBits } from '../_helpers/perm-bits'
import { createTempDir, removeTempDir } from '../_helpers/tmp'

const DAY_MS = 86_400_000

describe('getRotatedFileName', () => {
  test('formats a fixed date deterministically', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5, 123)
    expect(getRotatedFileName('/tmp/app.log', date)).toBe(
      '/tmp/app.log.2026-01-02-03-04-05-123'
    )
  })
})

describe('shouldRotate', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempDir()
  })

  afterEach(async () => {
    await removeTempDir(dir)
  })

  test('returns false when maxSize is undefined', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'x'.repeat(100))
    expect(await shouldRotate(filePath, {})).toBe(false)
  })

  test('returns true when the file exceeds maxSize', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'x'.repeat(100))
    expect(await shouldRotate(filePath, { maxSize: 10 })).toBe(true)
  })

  test('returns false when the file is smaller than maxSize', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'x'.repeat(10))
    expect(await shouldRotate(filePath, { maxSize: 1000 })).toBe(false)
  })
})

describe('performRotation retention', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempDir()
  })

  afterEach(async () => {
    await removeTempDir(dir)
  })

  test('count retention keeps only the newest maxFiles rotated files', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'live content')

    const now = Date.now()
    const rotatedPaths = [
      `${filePath}.2026-01-01-00-00-00-000`,
      `${filePath}.2026-01-02-00-00-00-000`,
      `${filePath}.2026-01-03-00-00-00-000`,
      `${filePath}.2026-01-04-00-00-00-000`
    ]

    await Promise.all(
      rotatedPaths.map(async (rotatedPath, index) => {
        await fs.writeFile(rotatedPath, `rotated-${index}`)
        const mtimeSeconds = now / 1000 - (rotatedPaths.length - index) * 60
        await fs.utimes(rotatedPath, mtimeSeconds, mtimeSeconds)
      })
    )

    await performRotation(filePath, { maxFiles: 2 })

    const entries = await fs.readdir(dir)
    const remainingRotated = entries.filter(name => name.startsWith('app.log.'))

    expect(remainingRotated).toHaveLength(2)
    expect(remainingRotated).not.toContain('app.log.2026-01-01-00-00-00-000')
    expect(remainingRotated).not.toContain('app.log.2026-01-02-00-00-00-000')
    expect(remainingRotated).toContain('app.log.2026-01-04-00-00-00-000')
  })

  test('time retention deletes only files older than the retention window', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'live content')

    const now = Date.now()
    const oldPath = `${filePath}.2020-01-01-00-00-00-000`
    const recentPath = `${filePath}.2026-01-01-00-00-00-000`

    await fs.writeFile(oldPath, 'old')
    await fs.writeFile(recentPath, 'recent')

    const oldMtimeSeconds = (now - 10 * DAY_MS) / 1000
    const recentMtimeSeconds = (now - 1000) / 1000
    await fs.utimes(oldPath, oldMtimeSeconds, oldMtimeSeconds)
    await fs.utimes(recentPath, recentMtimeSeconds, recentMtimeSeconds)

    await performRotation(filePath, { maxFiles: '7d' })

    const entries = await fs.readdir(dir)
    expect(entries).not.toContain('app.log.2020-01-01-00-00-00-000')
    expect(entries).toContain('app.log.2026-01-01-00-00-00-000')
  })

  test('is a no-op for an empty live file', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, '')

    await performRotation(filePath, { maxFiles: 2 })

    const entries = await fs.readdir(dir)
    expect(entries).toEqual(['app.log'])
    const stat = await fs.stat(filePath)
    expect(stat.size).toBe(0)
  })

  test('retention cleanup still runs when compression fails', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'live content')

    const now = Date.now()
    const rotatedPaths = [
      `${filePath}.2026-01-01-00-00-00-000`,
      `${filePath}.2026-01-02-00-00-00-000`,
      `${filePath}.2026-01-03-00-00-00-000`
    ]
    await Promise.all(
      rotatedPaths.map(async (rotatedPath, index) => {
        await fs.writeFile(rotatedPath, `rotated-${index}`)
        const mtimeSeconds = now / 1000 - (rotatedPaths.length - index) * 60
        await fs.utimes(rotatedPath, mtimeSeconds, mtimeSeconds)
      })
    )

    const originalWriteFile = fs.writeFile.bind(fs)
    const writeFileSpy = spyOn(fs, 'writeFile').mockImplementation(
      async (target, ...args) => {
        if (String(target).endsWith('.gz')) {
          throw new Error('EISDIR: illegal operation on a directory')
        }
        return await originalWriteFile(target, ...args)
      }
    )

    let errorCount = 0
    const onError = () => {
      errorCount += 1
    }

    try {
      await performRotation(filePath, { compress: true, maxFiles: 1 }, onError)
    } finally {
      writeFileSpy.mockRestore()
    }

    expect(errorCount).toBe(1)

    const entries = await fs.readdir(dir)
    const remainingRotated = entries.filter(name => name.startsWith('app.log.'))
    expect(remainingRotated).toHaveLength(1)
  })
})

describe('performRotation compression', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempDir()
  })

  afterEach(async () => {
    await removeTempDir(dir)
  })

  test('creates the archive with the given file mode', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'live content')

    await performRotation(filePath, { compress: true }, undefined, 0o640)

    const entries = await fs.readdir(dir)
    const archives = entries.filter(name => name.endsWith('.gz'))
    expect(archives).toHaveLength(1)
    const { mode } = await fs.stat(path.join(dir, archives[0]))
    expect(permBits(mode)).toBe('640')
  })

  test('defaults the archive mode to 0o600 when none is given', async () => {
    const filePath = path.join(dir, 'app.log')
    await fs.writeFile(filePath, 'live content')

    await performRotation(filePath, { compress: true })

    const entries = await fs.readdir(dir)
    const archives = entries.filter(name => name.endsWith('.gz'))
    expect(archives).toHaveLength(1)
    const { mode } = await fs.stat(path.join(dir, archives[0]))
    expect(permBits(mode)).toBe('600')
  })
})
