import { describe, expect, mock, test } from 'bun:test'
import { Elysia } from 'elysia'

import logixlysia from '../../src'
import { HttpError } from '../../src/interfaces'
import { normalizeLoggedError } from '../../src/utils/error'

const INTERNAL_SECRET = 'sk_live_do_not_leak'

const richError = () =>
  new HttpError(402, 'Card declined', {
    code: 'PAYMENT_DECLINED',
    fix: 'Try a different card, or contact your bank.',
    internal: { gatewayCode: 'do_not_honor', token: INTERNAL_SECRET },
    link: 'https://docs.example.com/errors/payment-declined',
    why: 'The issuing bank rejected the charge.'
  })

describe('HttpError', () => {
  test('keeps the existing two-argument shape working', () => {
    const error = new HttpError(404, 'Not found')

    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Not found')
    expect(error.name).toBe('HttpError')
    expect(error.code).toBeUndefined()
  })

  test('exposes the structured fields', () => {
    const error = richError()

    expect(error.code).toBe('PAYMENT_DECLINED')
    expect(error.why).toBe('The issuing bank rejected the charge.')
    expect(error.fix).toBe('Try a different card, or contact your bank.')
    expect(error.link).toBe('https://docs.example.com/errors/payment-declined')
    expect(error.internal).toEqual({
      gatewayCode: 'do_not_honor',
      token: INTERNAL_SECRET
    })
  })

  test('toJSON omits internal', () => {
    expect(richError().toJSON()).toEqual({
      code: 'PAYMENT_DECLINED',
      fix: 'Try a different card, or contact your bank.',
      link: 'https://docs.example.com/errors/payment-declined',
      message: 'Card declined',
      status: 402,
      why: 'The issuing bank rejected the charge.'
    })
  })

  test('internal survives no serialization path', () => {
    const error = richError()

    expect(JSON.stringify(error)).not.toContain(INTERNAL_SECRET)
    expect(JSON.stringify({ ...error })).not.toContain(INTERNAL_SECRET)
    expect(Object.keys(error)).not.toContain('internal')
  })

  test('name is non-enumerable, as on a native Error', () => {
    expect(Object.keys(new HttpError(404, 'Not found'))).not.toContain('name')
  })
})

describe('HttpError responses', () => {
  const app = new Elysia()
    .use(
      logixlysia({
        config: { disableFileLogging: true, disableInternalLogger: true }
      })
    )
    .get('/plain', () => {
      throw new HttpError(404, 'Not found')
    })
    .get('/rich', () => {
      throw richError()
    })

  test('a plain error still responds with the bare message', async () => {
    const response = await app.handle(new Request('http://localhost/plain'))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })

  test('a structured error responds as JSON with the client-safe payload', async () => {
    const response = await app.handle(new Request('http://localhost/rich'))

    expect(response.status).toBe(402)
    expect(await response.json()).toEqual({
      code: 'PAYMENT_DECLINED',
      fix: 'Try a different card, or contact your bank.',
      link: 'https://docs.example.com/errors/payment-declined',
      message: 'Card declined',
      status: 402,
      why: 'The issuing bank rejected the charge.'
    })
  })

  test('the response never carries internal', async () => {
    const response = await app.handle(new Request('http://localhost/rich'))

    expect(await response.text()).not.toContain(INTERNAL_SECRET)
  })
})

describe('HttpError logging', () => {
  test('normalizeLoggedError keeps every structured field, internal included', () => {
    const { error, message } = normalizeLoggedError(richError(), false)

    expect(message).toBe('Card declined')
    expect(error).toMatchObject({
      code: 'PAYMENT_DECLINED',
      fix: 'Try a different card, or contact your bank.',
      internal: { gatewayCode: 'do_not_honor', token: INTERNAL_SECRET },
      link: 'https://docs.example.com/errors/payment-declined',
      message: 'Card declined',
      name: 'HttpError',
      status: 402,
      why: 'The issuing bank rejected the charge.'
    })
  })

  test('the transport sees the full error, including internal', async () => {
    const events: Record<string, unknown>[] = []
    const transport = mock(
      (_level: string, _message: string, meta?: Record<string, unknown>) => {
        events.push(meta ?? {})
      }
    )

    const app = new Elysia()
      .use(
        logixlysia({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }]
          }
        })
      )
      .get('/rich', () => {
        throw richError()
      })

    await app.handle(new Request('http://localhost/rich'))

    expect(events[0]?.error).toMatchObject({
      code: 'PAYMENT_DECLINED',
      internal: { token: INTERNAL_SECRET }
    })
  })

  test('the console context tree lists code, why, fix, link, and internal', async () => {
    const lines: string[] = []
    const original = console.warn
    console.warn = ((message: string) => {
      lines.push(String(message))
    }) as typeof console.warn

    try {
      const app = new Elysia()
        .use(
          logixlysia({
            config: {
              disableFileLogging: true,
              showContextTree: true,
              useColors: false
            }
          })
        )
        .get('/rich', () => {
          throw richError()
        })

      await app.handle(new Request('http://localhost/rich'))
    } finally {
      console.warn = original
    }

    const output = lines.join('\n')
    expect(output).toContain('error.code')
    expect(output).toContain('error.why')
    expect(output).toContain('error.fix')
    expect(output).toContain('error.link')
    expect(output).toContain('error.internal')
  })
})
