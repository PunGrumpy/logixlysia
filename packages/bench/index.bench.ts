import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPinoLogger as createBogeychan } from '@bogeychan/elysia-logger'
import { consola } from 'consola'
import { Elysia } from 'elysia'
import { createLogger as createEvlog, initLogger } from 'evlog'
import logixlysia, { createLogger } from 'logixlysia'
import pino from 'pino'
import { bench, describe } from 'vitest'
import winston from 'winston'

// evlog prints every wide event to console in addition to draining it —
// pretty-formatted in dev, or JSON.stringify'd once `pretty` is off (see
// `emitWideEvent` in evlog's dist: the console branch is gated on
// `state.silent`, not `state.pretty`; `pretty` only chooses the format).
// `silent` only suppresses that console branch — the elysia plugin's own
// `drain` option flows through `options.drain ?? getGlobalDrain()` in its
// request middleware, independent of `state.drain`/`state.silent` — so this
// does not disable the drains configured below. Silencing it here makes the
// drain evlog's only sink, matching logixlysia's noop transport in the
// structured-sink suite.
initLogger({ pretty: false, silent: true })

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
    active: true,
    id: 123,
    meta: { foo: 'bar' },
    tags: ['a', 'b', 'c'],
    user: 'John Doe'
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

const silentLogixConfig = {
  disableFileLogging: true,
  disableInternalLogger: true,
  pino: { enabled: false }
} as const

const logixlysiaApp = new Elysia()
  .use(logixlysia({ config: silentLogixConfig }))
  .get('/', () => 'ok')

// `evlog/elysia` and `@bogeychan/elysia-logger` still declare an Elysia 1 peer
// and register the pre-2.0 lifecycle names, so their plugin-path benchmarks
// (overhead floor and structured sink) are parked until they ship Elysia 2
// builds. Their raw-logger benchmarks above are unaffected.
describe('Elysia plugin request path — overhead floor (all sinks disabled)', () => {
  bench('logixlysia', async () => {
    await logixlysiaApp.handle(new Request('http://localhost/'))
  })
})

// A no-op transport still exercises data assembly, context merge, meta
// construction, and dispatch — unlike the floor suite above, this is real
// work, just with a sink that discards the result instead of writing it
// anywhere. evlog's equivalent (a noop `drain` on its Elysia plugin) is
// parked with the other plugin-path benchmarks until evlog ships an
// Elysia 2 build.
const noopTransport = {
  log: () => {
    /* consume */
  }
}

const logixlysiaTransportApp = new Elysia()
  .use(
    logixlysia({
      config: {
        transports: [noopTransport],
        useTransportsOnly: true
      }
    })
  )
  .get('/', () => 'ok')

describe('Elysia plugin request path — structured sink (noop consumer)', () => {
  bench('logixlysia (transport)', async () => {
    await logixlysiaTransportApp.handle(new Request('http://localhost/'))
  })
})

const benchLogDir = mkdtempSync(join(tmpdir(), 'logixlysia-bench-'))

const logixlysiaFileApp = new Elysia()
  .use(
    logixlysia({
      config: {
        disableInternalLogger: true,
        logFilePath: join(benchLogDir, 'bench.log')
      }
    })
  )
  .get('/', () => 'ok')

// `logToFile` is fire-and-forget from `log()` (`.catch(() => {})`), so this
// suite measures enqueue cost per request plus amortized write cost — not a
// guarantee that each write has completed by the time `handle()` resolves.
describe('Elysia plugin request path — file sink', () => {
  bench('logixlysia (logFilePath)', async () => {
    await logixlysiaFileApp.handle(new Request('http://localhost/'))
  })
})
