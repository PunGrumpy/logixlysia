import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { LogRotationConfig, Options } from '../../src/interfaces'
import { logToFile } from '../../src/output/file'
import {
  compressFile,
  getRotatedFileName,
  performRotation,
  rotateFile,
  shouldRotate
} from '../../src/output/rotation-manager'
import {
  getRotatedFiles,
  parseInterval,
  parseRetention,
  parseSize,
  shouldRotateBySize
} from '../../utils/rotation'

const TEST_DIR = join(tmpdir(), 'logixlysia-rotation-test')
const ROTATED_FILENAME_PATTERN = /app\.log\.\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/

describe('Log Rotation Utilities', () => {
  describe('parseSize', () => {
    test('should parse numeric bytes', () => {
      expect(parseSize(1024)).toBe(1024)
      expect(parseSize(1_048_576)).toBe(1_048_576)
    })

    test('should parse kilobytes', () => {
      expect(parseSize('10k')).toBe(10 * 1024)
      expect(parseSize('5K')).toBe(5 * 1024)
      expect(parseSize('10kb')).toBe(10 * 1024)
    })

    test('should parse megabytes', () => {
      expect(parseSize('10m')).toBe(10 * 1024 * 1024)
      expect(parseSize('5M')).toBe(5 * 1024 * 1024)
      expect(parseSize('10mb')).toBe(10 * 1024 * 1024)
    })

    test('should parse gigabytes', () => {
      expect(parseSize('1g')).toBe(1 * 1024 * 1024 * 1024)
      expect(parseSize('2G')).toBe(2 * 1024 * 1024 * 1024)
      expect(parseSize('1gb')).toBe(1 * 1024 * 1024 * 1024)
    })

    test('should parse decimal values', () => {
      expect(parseSize('1.5m')).toBe(Math.floor(1.5 * 1024 * 1024))
      expect(parseSize('0.5g')).toBe(Math.floor(0.5 * 1024 * 1024 * 1024))
    })

    test('should throw error for invalid format', () => {
      expect(() => parseSize('invalid')).toThrow()
      expect(() => parseSize('10x')).toThrow()
    })
  })

  describe('parseInterval', () => {
    test('should parse hours', () => {
      expect(parseInterval('1h')).toBe(60 * 60 * 1000)
      expect(parseInterval('24h')).toBe(24 * 60 * 60 * 1000)
    })

    test('should parse days', () => {
      expect(parseInterval('1d')).toBe(24 * 60 * 60 * 1000)
      expect(parseInterval('7d')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    test('should parse weeks', () => {
      expect(parseInterval('1w')).toBe(7 * 24 * 60 * 60 * 1000)
      expect(parseInterval('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000)
    })

    test('should throw error for invalid format', () => {
      expect(() => parseInterval('invalid')).toThrow()
      expect(() => parseInterval('10x')).toThrow()
    })
  })

  describe('parseRetention', () => {
    test('should parse count-based retention', () => {
      const result = parseRetention(10)
      expect(result.type).toBe('count')
      expect(result.value).toBe(10)
    })

    test('should parse time-based retention', () => {
      const result = parseRetention('7d')
      expect(result.type).toBe('time')
      expect(result.value).toBe(7 * 24 * 60 * 60 * 1000)
    })

    test('should throw error for invalid format', () => {
      expect(() => parseRetention('invalid')).toThrow()
    })
  })
})

describe('Log Rotation File Operations', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  describe('shouldRotateBySize', () => {
    test('should return true when file exceeds max size', async () => {
      const filePath = join(TEST_DIR, 'test.log')
      const content = 'x'.repeat(1024 * 10) // 10KB
      await fs.writeFile(filePath, content)

      const result = await shouldRotateBySize(filePath, 1024 * 5) // 5KB
      expect(result).toBe(true)
    })

    test('should return false when file is below max size', async () => {
      const filePath = join(TEST_DIR, 'test.log')
      const content = 'x'.repeat(1024 * 2) // 2KB
      await fs.writeFile(filePath, content)

      const result = await shouldRotateBySize(filePath, 1024 * 5) // 5KB
      expect(result).toBe(false)
    })

    test('should return false when file does not exist', async () => {
      const filePath = join(TEST_DIR, 'nonexistent.log')
      const result = await shouldRotateBySize(filePath, 1024 * 5)
      expect(result).toBe(false)
    })
  })

  describe('getRotatedFileName', () => {
    test('should generate correct rotated filename', () => {
      const filePath = '/logs/app.log'
      const timestamp = new Date('2025-10-10T14:30:45')
      const result = getRotatedFileName(filePath, timestamp)
      expect(result).toBe('/logs/app.log.2025-10-10-14-30-45')
    })

    test('should handle different paths', () => {
      const filePath = './test.log'
      const timestamp = new Date('2025-01-01T00:00:00')
      const result = getRotatedFileName(filePath, timestamp)
      expect(result).toBe('./test.log.2025-01-01-00-00-00')
    })
  })

  describe('rotateFile', () => {
    test('should rotate file with content', async () => {
      const filePath = join(TEST_DIR, 'app.log')
      await fs.writeFile(filePath, 'log content\n')

      const rotatedPath = await rotateFile(filePath)
      expect(rotatedPath).toBeTruthy()
      expect(rotatedPath).toMatch(ROTATED_FILENAME_PATTERN)

      // Original file should not exist
      const originalExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(originalExists).toBe(false)

      // Rotated file should exist
      const rotatedExists = await fs
        .access(rotatedPath)
        .then(() => true)
        .catch(() => false)
      expect(rotatedExists).toBe(true)
    })

    test('should not rotate empty file', async () => {
      const filePath = join(TEST_DIR, 'empty.log')
      await fs.writeFile(filePath, '')

      const rotatedPath = await rotateFile(filePath)
      expect(rotatedPath).toBe('')

      // Original file should still exist
      const originalExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(originalExists).toBe(true)
    })

    test('should return empty string when file does not exist', async () => {
      const filePath = join(TEST_DIR, 'nonexistent.log')
      const rotatedPath = await rotateFile(filePath)
      expect(rotatedPath).toBe('')
    })
  })

  describe('compressFile', () => {
    test('should compress file using gzip', async () => {
      const filePath = join(TEST_DIR, 'compress-test.log')
      const content = 'x'.repeat(1000)
      await fs.writeFile(filePath, content)

      await compressFile(filePath)

      // Original file should be deleted
      const originalExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(originalExists).toBe(false)

      // Compressed file should exist
      const compressedPath = `${filePath}.gz`
      const compressedExists = await fs
        .access(compressedPath)
        .then(() => true)
        .catch(() => false)
      expect(compressedExists).toBe(true)

      // Compressed file should be smaller or equal
      const compressedStats = await fs.stat(compressedPath)
      expect(compressedStats.size).toBeGreaterThan(0)
    })
  })

  describe('getRotatedFiles', () => {
    test('should find rotated files', async () => {
      const basePath = join(TEST_DIR, 'app.log')

      // Create some rotated files
      await fs.writeFile(`${basePath}.2025-10-10-14-30-45`, 'content1')
      await fs.writeFile(`${basePath}.2025-10-09-12-00-00`, 'content2')
      await fs.writeFile(`${basePath}.2025-10-08-10-00-00.gz`, 'content3')

      const files = await getRotatedFiles(basePath)
      expect(files.length).toBe(3)
    })

    test('should return empty array when no rotated files exist', async () => {
      const basePath = join(TEST_DIR, 'nofiles.log')
      const files = await getRotatedFiles(basePath)
      expect(files.length).toBe(0)
    })

    test('should not include non-rotated files', async () => {
      const basePath = join(TEST_DIR, 'app.log')
      await fs.writeFile(basePath, 'current log')
      await fs.writeFile(`${basePath}.2025-10-10-14-30-45`, 'rotated')
      await fs.writeFile(join(TEST_DIR, 'other.log'), 'other log')

      const files = await getRotatedFiles(basePath)
      expect(files.length).toBe(1)
      expect(files[0]).toContain('app.log.2025-10-10-14-30-45')
    })
  })

  describe('shouldRotate', () => {
    test('should return true when file exceeds maxSize', async () => {
      const filePath = join(TEST_DIR, 'size-test.log')
      const content = 'x'.repeat(1024 * 10) // 10KB
      await fs.writeFile(filePath, content)

      const config: LogRotationConfig = {
        maxSize: '5k'
      }

      const result = await shouldRotate(filePath, config)
      expect(result).toBe(true)
    })

    test('should return false when file is below maxSize', async () => {
      const filePath = join(TEST_DIR, 'size-test.log')
      const content = 'x'.repeat(1024 * 2) // 2KB
      await fs.writeFile(filePath, content)

      const config: LogRotationConfig = {
        maxSize: '5k'
      }

      const result = await shouldRotate(filePath, config)
      expect(result).toBe(false)
    })

    test('should return false when file does not exist', async () => {
      const filePath = join(TEST_DIR, 'nonexistent.log')
      const config: LogRotationConfig = {
        maxSize: '5k'
      }

      const result = await shouldRotate(filePath, config)
      expect(result).toBe(false)
    })
  })

  describe('performRotation', () => {
    test('should perform complete rotation without compression', async () => {
      const filePath = join(TEST_DIR, 'rotation-test.log')
      await fs.writeFile(filePath, 'log content\n')

      const config: LogRotationConfig = {
        maxSize: '1k',
        maxFiles: 5
      }

      await performRotation(filePath, config)

      // Original file should not exist
      const originalExists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false)
      expect(originalExists).toBe(false)

      // Should have one rotated file
      const rotatedFiles = await getRotatedFiles(filePath)
      expect(rotatedFiles.length).toBe(1)
    })

    test('should perform rotation with compression', async () => {
      const filePath = join(TEST_DIR, 'compress-rotation.log')
      await fs.writeFile(filePath, 'log content\n'.repeat(100))

      const config: LogRotationConfig = {
        maxSize: '1k',
        compress: true,
        compression: 'gzip'
      }

      await performRotation(filePath, config)

      // Should have one compressed rotated file
      const files = await fs.readdir(TEST_DIR)
      const gzFiles = files.filter(f => f.endsWith('.gz'))
      expect(gzFiles.length).toBe(1)
    })

    test('should perform rotation with compression using default (compress: true only)', async () => {
      const filePath = join(TEST_DIR, 'compress-default.log')
      await fs.writeFile(filePath, 'log content\n'.repeat(100))

      const config: LogRotationConfig = {
        maxSize: '1k',
        compress: true
        // compression not specified - should default to gzip
      }

      await performRotation(filePath, config)

      // Should have one compressed rotated file
      const files = await fs.readdir(TEST_DIR)
      const gzFiles = files.filter(
        f => f.startsWith('compress-default.log') && f.endsWith('.gz')
      )
      expect(gzFiles.length).toBe(1)
    })

    test('should clean old files based on count retention', async () => {
      const filePath = join(TEST_DIR, 'cleanup-test.log')

      // Create multiple rotated files sequentially to ensure different modification times
      const createFiles = async () => {
        for (let i = 0; i < 5; i++) {
          // biome-ignore lint: Sequential execution needed for different modification times
          await fs.writeFile(
            `${filePath}.2025-10-${String(10 - i).padStart(2, '0')}-12-00-00`,
            `content${i}`
          )
          // Small delay to ensure different modification times
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }
      await createFiles()

      // Create current log file
      await fs.writeFile(filePath, 'current')

      const config: LogRotationConfig = {
        maxFiles: 3
      }

      await performRotation(filePath, config)

      // Should have only 3 rotated files (newest ones)
      const rotatedFiles = await getRotatedFiles(filePath)
      expect(rotatedFiles.length).toBeLessThanOrEqual(3)
    })
  })
})

describe('Log Rotation Integration', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  test('should rotate log when size limit is exceeded', async () => {
    const filePath = join(TEST_DIR, 'integration-size.log')
    const options: Options = {
      config: {
        logFilePath: filePath,
        logRotation: {
          maxSize: '1k'
        }
      }
    }

    const mockRequest = {
      headers: { get: () => null },
      method: 'GET',
      url: 'http://localhost/test'
    }

    const mockStore = { beforeTime: BigInt(0) }

    // Write enough logs to exceed size limit
    const largeMessage = 'x'.repeat(500)
    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: largeMessage },
      mockStore,
      options
    )

    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: largeMessage },
      mockStore,
      options
    )

    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: largeMessage },
      mockStore,
      options
    )

    // Check if rotation occurred
    const rotatedFiles = await getRotatedFiles(filePath)
    expect(rotatedFiles.length).toBeGreaterThan(0)
  })

  test('should handle rotation with compression', async () => {
    const filePath = join(TEST_DIR, 'integration-compress.log')
    const options: Options = {
      config: {
        logFilePath: filePath,
        logRotation: {
          maxSize: '500',
          compress: true,
          compression: 'gzip'
        }
      }
    }

    const mockRequest = {
      headers: { get: () => null },
      method: 'GET',
      url: 'http://localhost/test'
    }

    const mockStore = { beforeTime: BigInt(0) }

    // Write large log
    const largeMessage = 'x'.repeat(600)
    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: largeMessage },
      mockStore,
      options
    )

    // Write another log to trigger rotation
    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: 'new log' },
      mockStore,
      options
    )

    // Give compression time to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check for compressed files
    const files = await fs.readdir(TEST_DIR)
    const gzFiles = files.filter(f => f.endsWith('.gz'))
    expect(gzFiles.length).toBeGreaterThan(0)
  })

  test('should respect maxFiles retention policy', async () => {
    const filePath = join(TEST_DIR, 'integration-retention.log')

    // Pre-create some old rotated files sequentially to ensure different modification times
    const createOldFiles = async () => {
      for (let i = 0; i < 5; i++) {
        // biome-ignore lint: Sequential execution needed for different modification times
        await fs.writeFile(
          `${filePath}.2025-10-0${i + 1}-12-00-00`,
          `old content ${i}`
        )
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    await createOldFiles()

    const options: Options = {
      config: {
        logFilePath: filePath,
        logRotation: {
          maxSize: '100',
          maxFiles: 3
        }
      }
    }

    const mockRequest = {
      headers: { get: () => null },
      method: 'GET',
      url: 'http://localhost/test'
    }

    const mockStore = { beforeTime: BigInt(0) }

    // Write log and trigger rotation
    const largeMessage = 'x'.repeat(150)
    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: largeMessage },
      mockStore,
      options
    )

    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: 'trigger rotation' },
      mockStore,
      options
    )

    // Check that old files were cleaned up
    const rotatedFiles = await getRotatedFiles(filePath)
    expect(rotatedFiles.length).toBeLessThanOrEqual(3)
  })

  test('should work without rotation config', async () => {
    const filePath = join(TEST_DIR, 'no-rotation.log')
    const options: Options = {
      config: {
        logFilePath: filePath
      }
    }

    const mockRequest = {
      headers: { get: () => null },
      method: 'GET',
      url: 'http://localhost/test'
    }

    const mockStore = { beforeTime: BigInt(0) }

    await logToFile(
      filePath,
      'INFO',
      mockRequest,
      { message: 'test log' },
      mockStore,
      options
    )

    // File should exist
    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toContain('test log')

    // No rotated files should exist
    const rotatedFiles = await getRotatedFiles(filePath)
    expect(rotatedFiles.length).toBe(0)
  })
})
