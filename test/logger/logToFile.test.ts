import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import fs from 'fs/promises'
import path from 'path'

import { logToFile } from '~/logger/logToFile'
import { LogData, LogLevel, Options, RequestInfo, StoreData } from '~/types'

describe('logToFile', () => {
  const testDir = path.join(process.cwd(), 'test-logs')
  const testFile = path.join(testDir, 'test.log')

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should create a log file and write to it', async () => {
    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }
    const options: Options = {}

    await logToFile(testFile, level, request, data, store, options)

    const fileContent = await fs.readFile(testFile, 'utf-8')
    expect(fileContent).toContain('INFO')
    expect(fileContent).toContain('GET')
    expect(fileContent).toContain('200')
  })

  it('should append to an existing log file', async () => {
    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }
    const options: Options = {}

    await logToFile(testFile, level, request, data, store, options)
    await logToFile(testFile, level, request, data, store, options)

    const fileContent = await fs.readFile(testFile, 'utf-8')
    const logEntries = fileContent.trim().split('\n')
    expect(logEntries).toHaveLength(2)
  })

  it('should use custom log format if provided', async () => {
    const level: LogLevel = 'INFO'
    const request: RequestInfo = {
      url: '/test',
      method: 'GET',
      headers: { get: () => null }
    }
    const data: LogData = { status: 200 }
    const store: StoreData = { beforeTime: BigInt(0) }
    const options: Options = {
      config: {
        customLogFormat: '{level} - {method} {pathname}'
      }
    }

    await logToFile(testFile, level, request, data, store, options)

    const fileContent = await fs.readFile(testFile, 'utf-8')
    expect(fileContent.trim()).toMatch('INFO    - GET')
  })
})
