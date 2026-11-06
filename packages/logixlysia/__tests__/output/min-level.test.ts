import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import { createBetterStackTransport } from '../../src/better-stack'
import type { NeuralRedactor } from '../../src/desertant'
import { withRedaction } from '../../src/desertant'
import type { LogLevel, Options, Transport } from '../../src/interfaces'
import { logToTransports } from '../../src/output'
import { precomputedFor } from '../_helpers/precomputed'
import { createMockRequest } from '../_helpers/request'
import { waitFor } from '../_helpers/wait-for'

const LOGGED_BEFORE_ERROR = 1000

const createCapture = (
  minLevel?: LogLevel
): { levels: LogLevel[] } & Transport => {
  const levels: LogLevel[] = []
  return {
    levels,
    log: level => {
      levels.push(level)
    },
    minLevel
  }
}

const createApp = (transports: Transport[]) =>
  new Elysia()
    .use(
      logixlysia({
        config: {
          disableFileLogging: true,
          disableInternalLogger: true,
          transports
        }
      })
    )
    .get('/ok', () => 'ok')
    .get('/boom', () => {
      throw new Error('boom')
    })
    .get('/levels', ({ request, store }) => {
      store.logger.debug(request, 'd')
      store.logger.info(request, 'i')
      store.logger.warn(request, 'w')
      store.logger.error(request, 'e')
      return 'ok'
    })

const sendThroughTransports = (transport: Transport, level: LogLevel): void => {
  const options: Options = { config: { transports: [transport] } }
  const request = createMockRequest('http://localhost/x')
  logToTransports({
    data: { message: level },
    level,
    options,
    precomputed: precomputedFor(request),
    request,
    store: { beforeTime: 0n }
  })
}

describe('transport minLevel', () => {
  test('a transport with minLevel ERROR skips INFO while others get both', async () => {
    const errorsOnly = createCapture('ERROR')
    const everything = createCapture()
    const app = createApp([errorsOnly, everything])

    await app.handle(new Request('http://localhost/ok'))
    await app.handle(new Request('http://localhost/boom'))

    expect(errorsOnly.levels).toEqual(['ERROR'])
    expect(everything.levels).toEqual(['INFO', 'ERROR'])
  })

  test('minLevel WARNING receives WARNING and ERROR, not DEBUG or INFO', async () => {
    const warnings = createCapture('WARNING')
    const app = createApp([warnings])

    await app.handle(new Request('http://localhost/levels'))

    expect(warnings.levels).toEqual(['WARNING', 'ERROR'])
  })

  test('an adapter exposes the minLevel it was given', async () => {
    const transport = createBetterStackTransport({
      minLevel: 'ERROR',
      sourceToken: 'x'
    })

    expect(transport.minLevel).toBe('ERROR')
    await expect(transport.close()).resolves.toBeUndefined()
  })

  test('an adapter rejects a minLevel that is not a level', () => {
    expect(() =>
      createBetterStackTransport({
        minLevel: 'error' as never,
        sourceToken: 'x'
      })
    ).toThrow(/minLevel/u)
  })

  test('withRedaction forwards minLevel from the wrapped transport', () => {
    const redactor: NeuralRedactor = {
      redaction: text => Promise.resolve({ redactedText: text })
    }

    expect(
      withRedaction({ log() {}, minLevel: 'ERROR' }, redactor).minLevel
    ).toBe('ERROR')
    expect(withRedaction({ log() {} }, redactor).minLevel).toBeUndefined()
  })

  test('filtered records never fill the redaction queue', async () => {
    const { promise: gate, resolve: openGate }: PromiseWithResolvers<void> =
      Promise.withResolvers()
    const redactor: NeuralRedactor = {
      redaction: async text => {
        await gate
        return { redactedText: text }
      }
    }
    const dropped: string[] = []
    const inner = createCapture('ERROR')
    const transport = withRedaction(inner, redactor, {
      onDropped: ({ reason }) => dropped.push(reason)
    })

    for (let i = 0; i < LOGGED_BEFORE_ERROR; i += 1) {
      sendThroughTransports(transport, 'INFO')
    }
    sendThroughTransports(transport, 'ERROR')
    openGate()
    await waitFor(() => inner.levels.length > 0)

    expect(dropped).toEqual([])
    expect(inner.levels).toEqual(['ERROR'])
  })
})
