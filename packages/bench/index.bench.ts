import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { setImmediate as tick } from 'node:timers/promises'
import {
  logger as bogeychanLogger,
  createPinoLogger as createBogeychan
} from '@bogeychan/elysia-logger'
import { consola } from 'consola'
import { Elysia } from 'elysia'
import { createLogger as createEvlog, initLogger, log as evlogLog } from 'evlog'
import { evlog } from 'evlog/elysia'
import { createLogger, logixlysia } from 'logixlysia'
import pino from 'pino'
import type { BenchFn, BenchRegistration } from 'vitest'
import { test } from 'vitest'
import winston from 'winston'

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

let linesWritten = 0
let onLine: ((value: null) => void) | undefined

// Every library below writes into this one sink. Each case is timed until the
// sink has received its line, so work a library defers to a hook that runs
// after the response (two of the plugins below do) is inside the timed region.
const sink = (): void => {
  linesWritten += 1
  onLine?.(null)
}

const expectOneLine = async (
  label: string,
  run: () => unknown
): Promise<void> => {
  const before = linesWritten
  await run()
  await tick()
  const written = linesWritten - before
  if (written !== 1) {
    throw new Error(`${label}: expected 1 log line, got ${written}`)
  }
}

const plainCase = async (label: string, fn: () => void): Promise<Case> => {
  await expectOneLine(label, fn)
  return [label, fn]
}

interface Handler {
  handle: (request: Request) => Promise<Response>
}

const requestCase = async (label: string, app: Handler): Promise<Case> => {
  const send = (): Promise<Response> =>
    app.handle(new Request('http://localhost/'))
  await expectOneLine(label, send)
  return [
    label,
    async () => {
      const written = Promise.withResolvers<null>()
      onLine = written.resolve
      await send()
      await written.promise
    }
  ]
}

// The global drain wrapper is async but calls the drain synchronously, so the
// sink is reached inside the top-level `log.info`. A `createLogger().info` is
// not used: it only appends to the logger's context until `.emit()`.
initLogger({ drain: sink, pretty: false, silent: true })

const logix = createLogger({
  config: { transports: [{ log: sink }], useTransportsOnly: true }
})
const p = pino({}, { write: sink } as never)
// Under vitest consola defaults to a level that drops info, so set it.
const c = consola.create({ level: 3, reporters: [{ log: sink }] })
const w = winston.createLogger({
  transports: [
    new winston.transports.Stream({
      stream: new Writable({
        write(_chunk, _encoding, done) {
          sink()
          done()
        }
      })
    })
  ]
})
const bc = createBogeychan({ stream: { write: sink } as never })

const data = {
  active: true,
  id: 123,
  meta: { foo: 'bar' },
  tags: ['a', 'b', 'c'],
  user: 'John Doe'
}

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

suite('Simple Log (String)', [
  await plainCase('logixlysia', () => {
    logix.info(mockRequest, 'Hello World')
  }),
  await plainCase('pino', () => {
    p.info('Hello World')
  }),
  await plainCase('consola', () => {
    c.info('Hello World')
  }),
  await plainCase('winston', () => {
    w.info('Hello World')
  }),
  await plainCase('evlog', () => {
    evlogLog.info({ message: 'Hello World' })
  }),
  await plainCase('bogeychan', () => {
    bc.info('Hello World')
  })
])

suite('Structured Log (Object)', [
  await plainCase('logixlysia', () => {
    logix.info(mockRequest, 'Hello World', data)
  }),
  await plainCase('pino', () => {
    p.info(data, 'Hello World')
  }),
  await plainCase('consola', () => {
    c.info('Hello World', data)
  }),
  await plainCase('winston', () => {
    w.info('Hello World', data)
  }),
  await plainCase('evlog', () => {
    evlogLog.info({ message: 'Hello World', ...data })
  }),
  await plainCase('bogeychan', () => {
    bc.info(data, 'Hello World')
  })
])

suite('Deep Nested Log', [
  await plainCase('logixlysia', () => {
    logix.info(mockRequest, 'Deep nested', deepData)
  }),
  await plainCase('pino', () => {
    p.info(deepData, 'Deep nested')
  }),
  await plainCase('consola', () => {
    c.info('Deep nested', deepData)
  }),
  await plainCase('winston', () => {
    w.info('Deep nested', deepData)
  }),
  await plainCase('evlog', () => {
    evlogLog.info({ message: 'Deep nested', ...deepData })
  }),
  await plainCase('bogeychan', () => {
    bc.info(deepData, 'Deep nested')
  })
])

const transportOnly = {
  transports: [{ log: sink }],
  useTransportsOnly: true
}

const bareApp = new Elysia().get('/', () => 'ok')

const logixlysiaApp = new Elysia()
  .use(logixlysia({ config: transportOnly }))
  .get('/', () => 'ok')

const logixlysiaProdApp = new Elysia()
  .use(logixlysia({ config: transportOnly, preset: 'prod' }))
  .get('/', () => 'ok')

const evlogApp = new Elysia().use(evlog({ drain: sink })).get('/', () => 'ok')

const bogeychanApp = new Elysia()
  .use(bogeychanLogger({ stream: { write: sink } as never }))
  .get('/', () => 'ok')

suite('Elysia plugin request path (timed until the log line is written)', [
  await requestCase('logixlysia', logixlysiaApp),
  await requestCase('logixlysia (preset prod)', logixlysiaProdApp),
  await requestCase('evlog', evlogApp),
  await requestCase('bogeychan', bogeychanApp)
])

suite('Elysia request path reference (no logger)', [
  [
    'bare elysia',
    async () => {
      await bareApp.handle(new Request('http://localhost/'))
    }
  ]
])

const benchLogDir = mkdtempSync(path.join(tmpdir(), 'logixlysia-bench-'))

// Only logixlysia writes a file, and the file write is not awaited, so this
// times the enqueue and is not comparable with the cases above.
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

suite('Elysia plugin request path — file sink', [
  [
    'logixlysia (logFilePath)',
    async () => {
      await logixlysiaFileApp.handle(new Request('http://localhost/'))
    }
  ]
])
