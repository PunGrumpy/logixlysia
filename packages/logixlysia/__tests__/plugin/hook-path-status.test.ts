import { describe, expect, mock, test } from 'bun:test'
import { Elysia, status } from 'elysia'
import { HttpError, logixlysia } from '../../src'
import { levelForStatus } from '../../src/helpers/status'
import type { Options } from '../../src/interfaces'
import { isElysia2 } from '../_helpers/elysia'
import { sleep } from '../_helpers/sleep'

interface CapturedMeta {
  error?: unknown
  status?: number
}

const createCaptureTransport = () => {
  const transport = mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(
    () => {}
  )
  const options: Options = {
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      transports: [{ log: transport }]
    }
  }
  return { options, transport }
}

const recordAt = (
  transport: ReturnType<typeof createCaptureTransport>['transport'],
  index: number
): { level: unknown; meta: CapturedMeta } => {
  const call = transport.mock.calls[index]
  if (!call) {
    throw new Error(`no transport call recorded at index ${index}`)
  }
  return { level: call[0], meta: call[2] as CapturedMeta }
}

interface Handles {
  handle: (request: Request) => Promise<Response>
}

const run = async (app: Handles, path: string): Promise<Response> => {
  const response = await app.handle(new Request(`http://localhost${path}`))
  await response.text().catch(() => '')
  await sleep(30)
  return response
}

const buildApp = (aot: boolean, options: Options) =>
  new Elysia({ aot })
    .use(logixlysia(options))
    .get('/missing', () => status(404, 'nope'))
    .get('/created', () => new Response('made', { status: 201 }))
    .get('/teapot', ({ set }) => {
      set.status = 418
      return 'short'
    })
    .get('/named', ({ set }) => {
      set.status = 'Created'
      return 'ok'
    })
    .get('/broken', () => status(503, 'down'))

const cases = [
  { expectedLevel: 'WARNING', expectedStatus: 404, path: '/missing' },
  { expectedLevel: 'INFO', expectedStatus: 201, path: '/created' },
  { expectedLevel: 'WARNING', expectedStatus: 418, path: '/teapot' },
  { expectedLevel: 'INFO', expectedStatus: 201, path: '/named' },
  { expectedLevel: 'ERROR', expectedStatus: 503, path: '/broken' }
] as const

describe('access line status on the compiled and hook paths', () => {
  for (const aot of [true, false]) {
    for (const { expectedLevel, expectedStatus, path } of cases) {
      test(`logs ${expectedStatus} ${expectedLevel} for ${path} (aot: ${aot})`, async () => {
        const { options, transport } = createCaptureTransport()
        const app = buildApp(aot, options)

        const response = await run(app, path)

        expect(response.status).toBe(expectedStatus)
        expect(transport).toHaveBeenCalledTimes(1)
        const { level, meta } = recordAt(transport, 0)
        expect(meta.status).toBe(response.status)
        expect(level).toBe(expectedLevel)
        expect(level).toBe(levelForStatus(response.status))
      })
    }
  }
})

const buildMappedApp = (aot: boolean, options: Options, mapped: boolean) =>
  new Elysia({ aot })
    .use(logixlysia(options))
    .onError(({ error, set }) => {
      if (mapped && error instanceof Error && error.message === 'mapme') {
        set.status = 418
        return 'teapot'
      }
    })
    .get('/mapme', () => {
      throw new Error('mapme')
    })
    .get('/nope', () => {
      throw new HttpError(404, 'nope')
    })

const mappedCases = [
  {
    expectedLevel: 'WARNING',
    expectedStatus: 418,
    mapped: true,
    name: 'an error a later onError maps to 418',
    path: '/mapme'
  },
  {
    expectedLevel: 'ERROR',
    expectedStatus: 500,
    mapped: false,
    name: 'an unmapped error',
    path: '/mapme'
  },
  {
    expectedLevel: 'WARNING',
    expectedStatus: 404,
    mapped: false,
    name: 'a thrown HttpError(404)',
    path: '/nope'
  }
] as const

describe('mapped errors', () => {
  for (const aot of [true, false]) {
    for (const {
      expectedLevel,
      expectedStatus,
      mapped,
      name,
      path
    } of mappedCases) {
      test(`logs ${expectedStatus} ${expectedLevel} for ${name} (aot: ${aot})`, async () => {
        const { options, transport } = createCaptureTransport()
        const app = buildMappedApp(aot, options, mapped)

        const response = await run(app, path)

        expect(response.status).toBe(expectedStatus)
        expect(transport).toHaveBeenCalledTimes(1)
        const { level, meta } = recordAt(transport, 0)
        expect(meta.status).toBe(expectedStatus)
        expect(level).toBe(expectedLevel)
      })
    }
  }
})

// Elysia 2 removed `resolve`.
const resolveCases = isElysia2
  ? []
  : [
      {
        build: (aot: boolean, options: Options) =>
          new Elysia({ aot })
            .use(logixlysia(options))
            .resolve(() => status(401, 'no'))
            .get('/x', () => 'handler'),
        expectedLevel: 'WARNING',
        expectedStatus: 401,
        name: 'a resolve that returns status(401)'
      }
    ]

const answeredCases = [
  ...resolveCases,
  {
    build: (aot: boolean, options: Options) =>
      new Elysia({ aot })
        .use(logixlysia(options))
        .derive(() => status(403, 'no'))
        .get('/x', () => 'handler'),
    expectedLevel: 'WARNING',
    expectedStatus: 403,
    name: 'a derive that returns status(403)'
  },
  {
    build: (aot: boolean, options: Options) =>
      new Elysia({ aot })
        .use(logixlysia(options))
        .onRequest(() => new Response('early', { status: 202 }))
        .get('/x', () => 'handler'),
    expectedLevel: 'INFO',
    expectedStatus: 202,
    name: 'an onRequest that returns a 202 Response'
  }
]

describe('requests a hook answered', () => {
  for (const aot of [true, false]) {
    for (const {
      build,
      expectedLevel,
      expectedStatus,
      name
    } of answeredCases) {
      test(`logs ${expectedStatus} ${expectedLevel} without an error for ${name} (aot: ${aot})`, async () => {
        const { options, transport } = createCaptureTransport()
        const app = build(aot, options)

        const response = await run(app, '/x')

        expect(response.status).toBe(expectedStatus)
        expect(transport).toHaveBeenCalledTimes(1)
        const { level, meta } = recordAt(transport, 0)
        expect(meta.status).toBe(expectedStatus)
        expect(level).toBe(expectedLevel)
        expect(transport.mock.calls[0]?.[1]).toBe('')
        expect(meta.error).toBeUndefined()
      })
    }
  }
})

const thrownFunction = (): void => {}

describe('exits only onAfterResponse sees', () => {
  test('logs a thrown function as an error (aot: false)', async () => {
    const { options, transport } = createCaptureTransport()
    const app = new Elysia({ aot: false })
      .onError(() => 'handled')
      .use(logixlysia(options))
      .get('/x', () => {
        throw thrownFunction
      })

    await run(app, '/x')

    expect(transport).toHaveBeenCalledTimes(1)
    expect(recordAt(transport, 0).level).toBe('ERROR')
  })

  test('a later instance logs the status the client got when a mapResponse replaces an onError Response', async () => {
    const first = createCaptureTransport()
    const later = createCaptureTransport()
    const moduleA = new Elysia({ prefix: '/a' })
      .use(logixlysia(first.options))
      .get('/x', () => 'a')
    const moduleB = new Elysia({ prefix: '/b' })
      .use(logixlysia(later.options))
      .get('/x', ({ set }) => {
        set.status = 418
        throw new Error('boom')
      })
    const app = new Elysia()
      .onError(() => new Response('conflict', { status: 409 }))
      .mapResponse(
        ({ set }) => new Response('mapped', { status: Number(set.status) })
      )
      .use(moduleA)
      .use(moduleB)

    const response = await run(app, '/b/x')

    expect(later.transport).toHaveBeenCalledTimes(1)
    expect(recordAt(later.transport, 0).meta.status).toBe(response.status)
  })
})
