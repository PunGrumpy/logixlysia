import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  logger as bogeychanLogger,
  createPinoLogger as createBogeychan
} from '@bogeychan/elysia-logger'
import { consola } from 'consola'
import { Elysia } from 'elysia'
import { createLogger as createEvlog, initLogger } from 'evlog'
import { evlog } from 'evlog/elysia'
import { createLogger, logixlysia } from 'logixlysia'
import pino from 'pino'
import type { BenchFn, BenchRegistration } from 'vitest'
import { test } from 'vitest'
import winston from 'winston'

// BENCH_BASELINE=write stores every result under .baseline/, and
// BENCH_BASELINE=compare adds those stored results to each table as
// "<name> (base)" rows. The bench workflow runs the two in turn on one runner
// to compare two commits. Unset, each suite just compares its own cases.
const baselineMode = process.env.BENCH_BASELINE

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')

const baselineFile = (suite: string, name: string): string =>
  `.baseline/${slug(suite)}--${slug(name)}.json`

type Case = readonly [name: string, fn: BenchFn]

// tinybench's default under vitest 4. vitest 5 runs each case for far longer,
// and evlog queues a microtask per event that only drains once the loop
// yields, so a longer synchronous run exhausts the heap.
const RUN_OPTIONS = { time: 500 }

// Cases stay in the order given, so logixlysia leads each table; the
// comparison sorts rows by speed anyway.
const suite = (name: string, cases: readonly Case[]): void => {
  test(name, async ({ bench }) => {
    const registrations: BenchRegistration<string>[] = []
    for (const [label, fn] of cases) {
      const file = baselineFile(name, label)
      registrations.push(
        baselineMode === 'write'
          ? bench(label, { writeResult: file }, fn)
          : bench(label, fn)
      )
      if (baselineMode === 'compare') {
        registrations.push(bench.from(`${label} (base)`, file))
      }
    }
    const [first, second] = registrations
    if (first && !second) {
      await first.run(RUN_OPTIONS)
      return
    }
    await bench.compare(...registrations, RUN_OPTIONS)
  })
}

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

suite('Logger Creation', [
  [
    'logixlysia',
    () => {
      createLogger()
    }
  ],
  [
    'pino',
    () => {
      pino()
    }
  ],
  [
    'consola',
    () => {
      consola.create({})
    }
  ],
  [
    'winston',
    () => {
      winston.createLogger({})
    }
  ],
  [
    'evlog',
    () => {
      createEvlog()
    }
  ],
  [
    'bogeychan',
    () => {
      createBogeychan()
    }
  ]
])

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

suite('Simple Log (String)', [
  [
    'logixlysia',
    () => {
      logix.info(mockRequest, 'Hello World')
    }
  ],
  [
    'pino',
    () => {
      p.info('Hello World')
    }
  ],
  [
    'consola',
    () => {
      c.info('Hello World')
    }
  ],
  [
    'winston',
    () => {
      w.info('Hello World')
    }
  ],
  [
    'evlog',
    () => {
      ev.info('Hello World')
    }
  ],
  [
    'bogeychan',
    () => {
      bc.info('Hello World')
    }
  ]
])

const data = {
  active: true,
  id: 123,
  meta: { foo: 'bar' },
  tags: ['a', 'b', 'c'],
  user: 'John Doe'
}

suite('Structured Log (Object)', [
  [
    'logixlysia',
    () => {
      logix.info(mockRequest, 'Hello World', data)
    }
  ],
  [
    'pino',
    () => {
      p.info(data, 'Hello World')
    }
  ],
  [
    'consola',
    () => {
      c.info('Hello World', data)
    }
  ],
  [
    'winston',
    () => {
      w.info('Hello World', data)
    }
  ],
  [
    'evlog',
    () => {
      ev.info('Hello World', data)
    }
  ],
  [
    'bogeychan',
    () => {
      bc.info(data, 'Hello World')
    }
  ]
])

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

suite('Deep Nested Log', [
  [
    'logixlysia',
    () => {
      logix.info(mockRequest, 'Deep nested', deepData)
    }
  ],
  [
    'pino',
    () => {
      p.info(deepData, 'Deep nested')
    }
  ],
  [
    'consola',
    () => {
      c.info('Deep nested', deepData)
    }
  ],
  [
    'winston',
    () => {
      w.info('Deep nested', deepData)
    }
  ],
  [
    'evlog',
    () => {
      ev.info('Deep nested', deepData)
    }
  ],
  [
    'bogeychan',
    () => {
      bc.info(deepData, 'Deep nested')
    }
  ]
])

const silentLogixConfig = {
  disableFileLogging: true,
  disableInternalLogger: true,
  pino: { enabled: false }
} as const

const logixlysiaApp = new Elysia()
  .use(logixlysia({ config: silentLogixConfig }))
  .get('/', () => 'ok')

const evlogApp = new Elysia()
  .use(
    evlog({
      drain: () => {
        /* benchmark noop */
      }
    })
  )
  .get('/', () => 'ok')

const bogeychanApp = new Elysia()
  .use(
    bogeychanLogger({
      enabled: false
    })
  )
  .get('/', () => 'ok')

// evlog has no fully-disabled mode — its "floor" case (evlogApp, below)
// still assembles and drains a wide event per request, so its number here
// is not a pure dispatch floor. bogeychan (`enabled: false`) and
// logixlysia (all sinks disabled) are true floors.
suite('Elysia plugin request path — overhead floor (all sinks disabled)', [
  [
    'logixlysia',
    async () => {
      await logixlysiaApp.handle(new Request('http://localhost/'))
    }
  ],
  [
    'evlog',
    async () => {
      await evlogApp.handle(new Request('http://localhost/'))
    }
  ],
  [
    'bogeychan',
    async () => {
      await bogeychanApp.handle(new Request('http://localhost/'))
    }
  ]
])

// A no-op transport still exercises data assembly, context merge, meta
// construction, and dispatch — unlike the floor suite above, this is real
// work, just with a sink that discards the result instead of writing it
// anywhere. evlog's noop `drain` (reused from `evlogApp` above) is its
// equivalent structured sink, so this comparison is apples-to-apples.
// bogeychan has no comparable noop-sink mode (its `enabled: false` fully
// short-circuits, same as the floor suite), so it's left out here.
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

suite('Elysia plugin request path — structured sink (noop consumer)', [
  [
    'logixlysia (transport)',
    async () => {
      await logixlysiaTransportApp.handle(new Request('http://localhost/'))
    }
  ],
  [
    'evlog (drain)',
    async () => {
      await evlogApp.handle(new Request('http://localhost/'))
    }
  ]
])

const benchLogDir = mkdtempSync(path.join(tmpdir(), 'logixlysia-bench-'))

const logixlysiaFileApp = new Elysia()
  .use(
    logixlysia({
      config: {
        disableInternalLogger: true,
        logFilePath: path.join(benchLogDir, 'bench.log')
      }
    })
  )
  .get('/', () => 'ok')

// `logToFile` is fire-and-forget from `log()` (`.catch(() => {})`), so this
// suite measures enqueue cost per request plus amortized write cost — not a
// guarantee that each write has completed by the time `handle()` resolves.
suite('Elysia plugin request path — file sink', [
  [
    'logixlysia (logFilePath)',
    async () => {
      await logixlysiaFileApp.handle(new Request('http://localhost/'))
    }
  ]
])
