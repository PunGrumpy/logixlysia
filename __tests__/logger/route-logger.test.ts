import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import type { Logger as PinoLogger } from 'pino'
import type { LogixlysiaContext } from '../../packages/cli'
import logixlysia from '../../packages/cli'

describe('Route Logger', () => {
  it('should log custom messages in route handlers', async () => {
    const app = new Elysia().use(
      logixlysia({
        config: {
          customLogFormat: '{level} {message} {context}',
          showStartupMessage: false,
          useColors: false // Disable colors for testing
        }
      })
    )

    const originalConsoleLog = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    app.get('/test', ({ store, request }: LogixlysiaContext) => {
      const { logger, pino } = store
      logger.info(request, 'Test message', { test: 'value' })
      // Test direct Pino access
      expect(pino).toBeDefined()
      return { success: true }
    })

    const response = await app.handle(new Request('http://localhost/test'))
    expect(response.status).toBe(200)

    console.log = originalConsoleLog

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('INFO')
    expect(logs[0]).toContain('Test message')
  })

  it('should not duplicate logs when using custom logging', async () => {
    const app = new Elysia().use(
      logixlysia({
        config: {
          customLogFormat: '{level} {message} {context}',
          showStartupMessage: false,
          useColors: false // Disable colors for testing
        }
      })
    )

    const originalConsoleLog = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    app.get('/test', ({ store, request }: LogixlysiaContext) => {
      const { logger } = store
      logger.info(request, 'Custom log message')
      return { success: true }
    })

    const response = await app.handle(new Request('http://localhost/test'))
    expect(response.status).toBe(200)

    console.log = originalConsoleLog

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('INFO')
    expect(logs[0]).toContain('Custom log message')
  })

  it('should support different log levels', async () => {
    const app = new Elysia().use(
      logixlysia({
        config: {
          customLogFormat: '{level} {message} {context}',
          showStartupMessage: false,
          useColors: false // Disable colors for testing
        }
      })
    )

    const originalConsoleLog = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    app.get('/test', ({ store, request }: LogixlysiaContext) => {
      const { logger } = store
      logger.debug(request, 'Debug message')
      logger.info(request, 'Info message')
      logger.warn(request, 'Warning message')
      logger.error(request, 'Error message')
      return { success: true }
    })

    const response = await app.handle(new Request('http://localhost/test'))
    expect(response.status).toBe(200)

    console.log = originalConsoleLog

    expect(logs).toHaveLength(4)
    expect(logs[0]).toContain('DEBUG')
    expect(logs[1]).toContain('INFO')
    expect(logs[2]).toContain('WARNING')
    expect(logs[3]).toContain('ERROR')
  })

  it('should include context data in logs', async () => {
    const app = new Elysia().use(
      logixlysia({
        config: {
          customLogFormat: '{level} {message} {context}',
          showStartupMessage: false,
          useColors: false // Disable colors for testing
        }
      })
    )

    const originalConsoleLog = console.log
    const logs: string[] = []
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    app.get('/test', ({ store, request }: LogixlysiaContext) => {
      const { logger } = store
      logger.info(request, 'Test message', {
        userId: 123,
        action: 'test',
        timestamp: Date.now()
      })
      return { success: true }
    })

    const response = await app.handle(new Request('http://localhost/test'))
    expect(response.status).toBe(200)

    console.log = originalConsoleLog

    expect(logs).toHaveLength(1)
    expect(logs[0]).toContain('INFO')
    expect(logs[0]).toContain('Test message')
    expect(logs[0]).toContain('"userId":123')
    expect(logs[0]).toContain('"action":"test"')
  })

  it('should provide direct access to Pino logger in routes', async () => {
    const app = new Elysia().use(
      logixlysia({
        config: {
          showStartupMessage: false
        }
      })
    )

    let pinoLogger: PinoLogger | undefined

    app.get('/test', ({ store }: LogixlysiaContext) => {
      const { pino } = store
      pinoLogger = pino
      return { success: true }
    })

    const response = await app.handle(new Request('http://localhost/test'))
    expect(response.status).toBe(200)
    expect(pinoLogger).toBeDefined()
    expect(typeof pinoLogger?.info).toBe('function')
    expect(typeof pinoLogger?.error).toBe('function')
    expect(typeof pinoLogger?.warn).toBe('function')
    expect(typeof pinoLogger?.debug).toBe('function')
  })
})
