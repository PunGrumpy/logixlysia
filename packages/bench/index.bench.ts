import { createPinoLogger as createBogeychan } from '@bogeychan/elysia-logger'
import { consola } from 'consola'
import { createLogger as createEvlog } from 'evlog'
import { createLogger } from 'logixlysia/src/logger/index.js'
import pino from 'pino'
import { bench, describe } from 'vitest'
import winston from 'winston'

const mockRequest = new Request('http://localhost:3000/')

describe('Logger Creation', () => {
  bench('logixlysia', () => {
    createLogger()
  })

  bench('pino', () => {
    pino()
  })

  bench('consola', () => {
    consola.create({})
  })

  bench('winston', () => {
    winston.createLogger({})
  })

  bench('evlog', () => {
    createEvlog()
  })

  bench('bogeychan', () => {
    createBogeychan()
  })
})

// Initialize loggers with output disabled for fair comparison of overhead
const logix = createLogger({
  config: {
    disableInternalLogger: true,
    pino: { enabled: false }
  }
})
const p = pino({ enabled: false })
const c = consola.create({ level: -1 })
const w = winston.createLogger({
  silent: true,
  transports: [new winston.transports.Console()]
})
const ev = createEvlog()
const bc = createBogeychan({ enabled: false })

describe('Simple Log (String)', () => {
  bench('logixlysia', () => {
    logix.info(mockRequest, 'Hello World')
  })

  bench('pino', () => {
    p.info('Hello World')
  })

  bench('consola', () => {
    c.info('Hello World')
  })

  bench('winston', () => {
    w.info('Hello World')
  })

  bench('evlog', () => {
    ev.info('Hello World')
  })

  bench('bogeychan', () => {
    bc.info('Hello World')
  })
})

describe('Structured Log (Object)', () => {
  const data = {
    user: 'John Doe',
    id: 123,
    active: true,
    tags: ['a', 'b', 'c'],
    meta: { foo: 'bar' }
  }

  bench('logixlysia', () => {
    logix.info(mockRequest, 'Hello World', data)
  })

  bench('pino', () => {
    p.info(data, 'Hello World')
  })

  bench('consola', () => {
    c.info('Hello World', data)
  })

  bench('winston', () => {
    w.info('Hello World', data)
  })

  bench('evlog', () => {
    ev.info('Hello World', data)
  })

  bench('bogeychan', () => {
    bc.info(data, 'Hello World')
  })
})

describe('Deep Nested Log', () => {
  const deepData = {
    a: {
      b: {
        c: {
          d: {
            e: 'f'
          }
        }
      }
    }
  }

  bench('logixlysia', () => {
    logix.info(mockRequest, 'Deep nested', deepData)
  })

  bench('pino', () => {
    p.info(deepData, 'Deep nested')
  })

  bench('consola', () => {
    c.info('Deep nested', deepData)
  })

  bench('winston', () => {
    w.info('Deep nested', deepData)
  })

  bench('evlog', () => {
    ev.info('Deep nested', deepData)
  })

  bench('bogeychan', () => {
    bc.info(deepData, 'Deep nested')
  })
})
