import { describe, expect, mock, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import { logToTransports } from '../../src/output'
import { createMockRequest } from '../_helpers/request'

describe('logToTransports', () => {
  test('calls all transports with level/message/meta', () => {
    const t1 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )
    const t2 = mock<(lvl: unknown, msg: unknown, metaArg?: unknown) => void>(
      () => {
        /* noop */
      }
    )

    const options: Options = {
      config: {
        transports: [{ log: t1 }, { log: t2 }]
      }
    }

    const request = createMockRequest('http://localhost/hello')
    const store = { beforeTime: BigInt(0) }

    logToTransports({
      level: 'INFO',
      request,
      data: { message: 'Test message', status: 200 },
      store,
      options
    })

    expect(t1).toHaveBeenCalledTimes(1)
    expect(t2).toHaveBeenCalledTimes(1)

    const firstCall = t1.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [levelValue, messageValue, metaValue] = firstCall ?? [
      undefined,
      undefined,
      undefined
    ]
    expect(levelValue).toBe('INFO')
    expect(messageValue).toBe('Test message')
    expect(metaValue).toBeTypeOf('object')
    const meta = metaValue as unknown as Record<string, unknown>
    expect(meta.beforeTime).toBe(store.beforeTime)

    const req = meta.request as { method?: unknown; url?: unknown } | undefined
    expect(req?.method).toBe('GET')
    expect(req?.url).toBe('http://localhost/hello')
  })

  test('never throws when a transport throws', () => {
    const throwing = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => void
    >(() => {
      throw new Error('boom')
    })

    const options: Options = { config: { transports: [{ log: throwing }] } }
    const request = createMockRequest('http://localhost/throw')
    const store = { beforeTime: BigInt(0) }

    expect(() => {
      logToTransports({
        level: 'INFO',
        request,
        data: { message: 'ignored' },
        store,
        options
      })
    }).not.toThrow()
  })

  test('swallows async transport rejections', async () => {
    const rejecting = mock<
      (lvl: unknown, msg: unknown, metaArg?: unknown) => Promise<void>
    >(() => Promise.reject(new Error('nope')))

    const options: Options = { config: { transports: [{ log: rejecting }] } }
    const request = createMockRequest('http://localhost/reject')
    const store = { beforeTime: BigInt(0) }

    logToTransports({
      level: 'INFO',
      request,
      data: { message: 'async' },
      store,
      options
    })

    // Let promise microtasks run; rejections should be caught internally.
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(rejecting).toHaveBeenCalledTimes(1)
  })
})
