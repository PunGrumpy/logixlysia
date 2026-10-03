import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { SinkErrorContext } from '../../src/interfaces'
import { spyConsole } from '../_helpers/console'

const ESCAPE = '\u001B'

const capturedText = (
  spies: ReturnType<typeof spyConsole>['spies']
): string[] =>
  Object.values(spies).flatMap(spy =>
    spy.mock.calls.map(call => String(call[0]))
  )

describe('logging never fails a request', () => {
  test('an object body thrown with status() in onRequest still answers 401', async () => {
    const { restore } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia())
        .onRequest(({ status }) => {
          throw status(401, { error: 'unauthorized' })
        })
        .get('/x', () => 'x')

      const res = await app.handle(new Request('http://localhost/x'))

      expect(res.status).toBe(401)
    } finally {
      restore()
    }
  })

  test('a BigInt in context prints through {context} with the tree off', async () => {
    const { restore, spies } = spyConsole()
    try {
      const app = new Elysia()
        .use(
          logixlysia({
            config: {
              customLogFormat: '{method} {pathname} {status} {context}',
              showContextTree: false
            }
          })
        )
        .get('/x', ({ log }) => {
          log.mergeContext({ orderId: 10n })
          return 'ok'
        })

      const res = await app.handle(new Request('http://localhost/x'))

      expect(res.status).toBe(200)
      expect(
        capturedText(spies).some(line => line.includes('"orderId":"10"'))
      ).toBe(true)
    } finally {
      restore()
    }
  })

  test('a circular context prints through {context} with the tree off', async () => {
    const { restore, spies } = spyConsole()
    try {
      const node: Record<string, unknown> = { name: 'n' }
      node.self = node

      const app = new Elysia()
        .use(
          logixlysia({
            config: {
              customLogFormat: '{method} {pathname} {status} {context}',
              showContextTree: false
            }
          })
        )
        .get('/x', ({ log }) => {
          log.mergeContext({ node })
          return 'ok'
        })

      const res = await app.handle(new Request('http://localhost/x'))

      expect(res.status).toBe(200)
      expect(
        capturedText(spies).some(line => line.includes('[Circular]'))
      ).toBe(true)
    } finally {
      restore()
    }
  })

  test('control characters in a context key are escaped, not printed', async () => {
    const { restore, spies } = spyConsole()
    try {
      const app = new Elysia()
        .use(logixlysia({ config: { useColors: false } }))
        .get('/x', ({ log }) => {
          log.info('search', { [`${ESCAPE}[31mRED\nFAKE`]: 'x' })
          return 'ok'
        })

      await app.handle(new Request('http://localhost/x'))

      const lines = capturedText(spies)
      expect(lines.some(line => line.includes(ESCAPE))).toBe(false)
      const record = lines.find(line => line.includes('search'))
      expect(record?.split('\n')).toHaveLength(2)
    } finally {
      restore()
    }
  })

  test('a failure while formatting is reported to onError as sink format', async () => {
    const { restore } = spyConsole()
    try {
      const onError = mock<(context: SinkErrorContext) => void>(() => {
        /* noop */
      })
      const nested = {}
      Object.defineProperty(nested, 'boom', {
        enumerable: true,
        get: () => {
          throw new Error('getter')
        }
      })

      const app = new Elysia()
        .use(logixlysia({ config: { contextDepth: 2, onError } }))
        .get('/x', ({ log }) => {
          log.mergeContext({ nested })
          return 'ok'
        })

      const res = await app.handle(new Request('http://localhost/x'))

      expect(res.status).toBe(200)
      expect(onError.mock.calls[0]?.[0].sink).toBe('format')
    } finally {
      restore()
    }
  })
})
