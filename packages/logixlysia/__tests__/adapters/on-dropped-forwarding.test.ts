import { expect, mock, test } from 'bun:test'
import type {
  AdapterTransport,
  BatchTransportOptions
} from '../../src/adapters/shared'
import { createAxiomTransport } from '../../src/axiom'
import { createBetterStackTransport } from '../../src/better-stack'
import { createClickHouseTransport } from '../../src/clickhouse'
import { createDatadogTransport } from '../../src/datadog'
import { createHyperDXTransport } from '../../src/hyperdx'
import { createLokiTransport } from '../../src/loki'
import { createOtlpTransport } from '../../src/otlp'
import { createPostHogTransport } from '../../src/posthog'
import { createSentryTransport } from '../../src/sentry'

type Factory = (options: BatchTransportOptions) => AdapterTransport

const factories: [string, Factory][] = [
  [
    'axiom',
    options =>
      createAxiomTransport({ ...options, apiKey: 'xaat-test', dataset: 'logs' })
  ],
  [
    'better-stack',
    options => createBetterStackTransport({ ...options, sourceToken: 'bs' })
  ],
  [
    'clickhouse',
    options =>
      createClickHouseTransport({
        ...options,
        password: 'secret',
        username: 'writer'
      })
  ],
  [
    'datadog',
    options => createDatadogTransport({ ...options, apiKey: 'dd-key' })
  ],
  [
    'hyperdx',
    options => createHyperDXTransport({ ...options, apiKey: 'hdx-key' })
  ],
  [
    'loki',
    options => createLokiTransport({ ...options, url: 'http://loki:3100' })
  ],
  [
    'otlp',
    options =>
      createOtlpTransport({ ...options, endpoint: 'http://collector:4318' })
  ],
  [
    'posthog',
    options => createPostHogTransport({ ...options, apiKey: 'phc_test' })
  ],
  [
    'sentry',
    options =>
      createSentryTransport({
        ...options,
        dsn: 'https://publickey@o123.ingest.sentry.io/456'
      })
  ]
]

test.each(factories)(
  '%s forwards onDropped to the shared transport',
  async (_name, create) => {
    const onDropped = mock((_info: { count: number; reason: string }) => {})
    const transport = create({ onDropped })

    await transport.close()
    transport.log('INFO', 'x')

    expect(onDropped.mock.calls).toEqual([[{ count: 1, reason: 'closed' }]])
  }
)
