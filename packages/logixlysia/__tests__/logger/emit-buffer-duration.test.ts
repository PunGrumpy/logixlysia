import { expect, test } from 'bun:test'
import type { Options } from '../../src/interfaces'
import { emit, resolveSinks } from '../../src/logger/emit'
import type { BufferedRecord, SamplingRuntime } from '../../src/sampling'

test('a record buffered for tail sampling keeps the supplied durationOverride', () => {
  const buffered: BufferedRecord[] = []
  const sampling = {
    buffer: (_request: Request, record: BufferedRecord) => {
      buffered.push(record)
    },
    decide: () => 'buffer'
  } as unknown as SamplingRuntime
  const options: Options = { config: {} }

  const outcome = emit({
    contextStore: {} as never,
    data: {},
    durationOverride: 5,
    formatContext: {} as never,
    level: 'INFO',
    options,
    request: new Request('http://localhost/'),
    sampling,
    sinks: resolveSinks(options.config),
    store: { beforeTime: process.hrtime.bigint() - 1_000_000_000n } as never
  })

  expect(outcome).toBe('buffered')
  expect(buffered[0]?.durationMs).toBe(5)
})
