import { describe, expect, test } from 'bun:test'
import { Elysia } from 'elysia'
import { logixlysia } from '../../src'
import type { Options, Transport } from '../../src'
import { createDatadogTransport } from '../../src/datadog'
import { createMemoryTransport } from '../../src/testing'
import type { MemoryRecord } from '../../src/testing'
import { stubFetch } from '../adapters/helpers'

type Config = NonNullable<Options['config']>

const recordsFor = async (
  config: Config,
  transport: Transport = createMemoryTransport()
): Promise<readonly MemoryRecord[]> => {
  const memory = createMemoryTransport()
  const app = new Elysia()
    .use(
      logixlysia({
        config: {
          disableFileLogging: true,
          disableInternalLogger: true,
          ...config,
          transports: [memory, transport]
        }
      })
    )
    .get('/orders', ({ log, request, store }) => {
      log.info('order loaded', { service: 'other' })
      store.logger.log(
        'INFO',
        request,
        { message: 'called upstream', service: 'other' },
        { beforeTime: process.hrtime.bigint() }
      )
      return 'ok'
    })
  await app.handle(new Request('http://localhost/orders'))
  return memory.records
}

const accessRecord = (records: readonly MemoryRecord[]) =>
  records.find(record => record.message === '')

const recordWithMessage = (records: readonly MemoryRecord[], message: string) =>
  records.find(record => record.message === message)

describe('the configured service on transport records', () => {
  test('the access line and a handler line carry the service', async () => {
    const records = await recordsFor({ service: 'my-api' })

    expect(accessRecord(records)?.meta.service).toBe('my-api')
    expect(recordWithMessage(records, 'order loaded')?.meta.service).toBe(
      'my-api'
    )
  })

  test('a record has no service key when none is configured', async () => {
    const records = await recordsFor({})

    expect(records).toHaveLength(3)
    expect('service' in (accessRecord(records)?.meta ?? {})).toBe(false)
    expect(
      'service' in (recordWithMessage(records, 'order loaded')?.meta ?? {})
    ).toBe(false)
  })

  test('a blank service name adds no service key', async () => {
    const records = await recordsFor({ service: '   ' })

    expect(records).toHaveLength(3)
    expect('service' in (accessRecord(records)?.meta ?? {})).toBe(false)
    expect(
      'service' in (recordWithMessage(records, 'order loaded')?.meta ?? {})
    ).toBe(false)
  })

  test('a service key in the logged data does not replace the configured name', async () => {
    const records = await recordsFor({ service: 'my-api' })

    const handlerMeta = recordWithMessage(records, 'order loaded')?.meta
    expect(handlerMeta?.service).toBe('my-api')
    expect(handlerMeta?.context).toEqual({ service: 'other' })
    expect(recordWithMessage(records, 'called upstream')?.meta.service).toBe(
      'my-api'
    )
  })

  test('the Datadog transport keeps its own service name', async () => {
    const stub = stubFetch()
    try {
      const datadog = createDatadogTransport({
        apiKey: 'k',
        service: 'dd-name'
      })
      await recordsFor({ service: 'my-api' }, datadog)
      await datadog.flush()

      const events = stub.calls.flatMap(
        call => JSON.parse(call.body) as Record<string, unknown>[]
      )
      expect(events).toHaveLength(3)
      for (const event of events) {
        expect(event.service).toBe('dd-name')
      }
    } finally {
      stub.restore()
    }
  })
})
