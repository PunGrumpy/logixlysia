import { describe, expect, test } from 'bun:test'

import type { NeuralCallOptions, NeuralRedactor } from '../../src/desertant'
import { withRedaction } from '../../src/desertant'
import type { LogLevel, Transport } from '../../src/interfaces'

interface Recorded {
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

const createSink = (): { flushed: number; records: Recorded[] } & Transport => {
  const records: Recorded[] = []
  return {
    flushed: 0,
    log: (level, message, meta) => {
      records.push({ level, message, meta })
    },
    records
  }
}

/** Fails loudly instead of tripping over an optional chain when nothing was recorded. */
const metaOf = (records: Recorded[], index = 0): Record<string, unknown> => {
  const meta = records[index]?.meta
  if (meta === undefined) {
    throw new Error(`no meta recorded at index ${index}`)
  }
  return meta
}

const NAME_PATTERN = /Anna Müller/g

/**
 * Stands in for `@desert-ant-labs/redact`: masks one known name so a test can
 * assert the model pass ran, without downloading a 46 MB model.
 */
const createStubRedactor = (
  overrides: Partial<NeuralRedactor> = {}
): {
  calls: { options?: NeuralCallOptions; text: string }[]
} & NeuralRedactor => {
  const calls: { options?: NeuralCallOptions; text: string }[] = []
  return {
    calls,
    redaction: (text: string, options?: NeuralCallOptions) => {
      calls.push({ options, text })
      return Promise.resolve({
        redactedText: text.replace(NAME_PATTERN, '[GIVEN_NAME_1]')
      })
    },
    ...overrides
  }
}

describe('logixlysia/desertant', () => {
  test('redacts the message before the transport sees it', async () => {
    const sink = createSink()
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'GET /users - Anna Müller')
    await transport.flush()

    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.message).toBe('GET /users - [GIVEN_NAME_1]')
  })

  test('redacts strings nested in meta, arrays included', async () => {
    const sink = createSink()
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'ok', {
      context: { notes: ['seen by Anna Müller'], status: 200 },
      user: 'Anna Müller'
    })
    await transport.flush()

    const meta = sink.records[0]?.meta as {
      context: { notes: string[]; status: number }
      user: string
    }
    expect(meta.user).toBe('[GIVEN_NAME_1]')
    expect(meta.context.notes[0]).toBe('seen by [GIVEN_NAME_1]')
    expect(meta.context.status).toBe(200)
  })

  test('leaves meta untouched when includeMeta is off', async () => {
    const sink = createSink()
    const meta = { user: 'Anna Müller' }
    const transport = withRedaction(sink, createStubRedactor(), {
      includeMeta: false
    })

    transport.log('INFO', 'ok', meta)
    await transport.flush()

    expect(sink.records[0]?.meta).toBe(meta)
  })

  test('does not mutate the caller’s meta object', async () => {
    const sink = createSink()
    const meta = { user: 'Anna Müller' }
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'ok', meta)
    await transport.flush()

    expect(meta.user).toBe('Anna Müller')
  })

  test('redacts an Error, its cause and own fields without touching the original', async () => {
    const sink = createSink()
    const originalCause = new Error('Anna Müller caused it')
    const original = Object.assign(
      new Error('Anna Müller not found', { cause: originalCause }),
      { requestedBy: 'Anna Müller' }
    )
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('ERROR', 'failed', { error: original })
    await transport.flush()

    const { error } = metaOf(sink.records) as {
      error: Error & { cause: Error; requestedBy: string }
    }
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('[GIVEN_NAME_1] not found')
    expect(error.cause.message).toBe('[GIVEN_NAME_1] caused it')
    expect(error.requestedBy).toBe('[GIVEN_NAME_1]')
    expect(original.message).toBe('Anna Müller not found')
    expect(originalCause.message).toBe('Anna Müller caused it')
    expect(original.requestedBy).toBe('Anna Müller')
  })

  test('redacts the non-enumerable errors owned by an AggregateError', async () => {
    const sink = createSink()
    const original = new AggregateError(
      [new Error('Anna Müller failed'), 'Anna Müller input'],
      'Anna Müller aggregate'
    )
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('ERROR', 'failed', { error: original })
    await transport.flush()

    const { error } = metaOf(sink.records) as { error: AggregateError }
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.message).toBe('[GIVEN_NAME_1] aggregate')
    expect((error.errors[0] as Error).message).toBe('[GIVEN_NAME_1] failed')
    expect(error.errors[1]).toBe('[GIVEN_NAME_1] input')
    expect((original.errors[0] as Error).message).toBe('Anna Müller failed')
  })

  test('passes non-plain objects such as Date through by reference', async () => {
    const sink = createSink()
    const at = new Date('2026-01-01T00:00:00.000Z')
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'ok', { at })
    await transport.flush()

    expect((metaOf(sink.records) as { at: Date }).at).toBe(at)
  })

  test('stops walking meta at maxDepth', async () => {
    const sink = createSink()
    const transport = withRedaction(sink, createStubRedactor(), { maxDepth: 1 })

    transport.log('INFO', 'ok', { a: { b: 'Anna Müller' } })
    await transport.flush()

    const meta = sink.records[0]?.meta as { a: { b: string } }
    expect(meta.a.b).toBe('Anna Müller')
  })

  test('survives a circular meta graph', async () => {
    const sink = createSink()
    const meta: Record<string, unknown> = { user: 'Anna Müller' }
    meta.self = meta
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'ok', meta)
    await transport.flush()

    const redacted = sink.records[0]?.meta as { self: unknown; user: string }
    expect(redacted.user).toBe('[GIVEN_NAME_1]')
    expect(redacted.self).toBe('[Circular]')
  })

  test('redacts repeated references in separate sibling branches', async () => {
    const sink = createSink()
    const shared = { user: 'Anna Müller' }
    const transport = withRedaction(sink, createStubRedactor())

    transport.log('INFO', 'ok', { left: shared, right: shared })
    await transport.flush()

    const redacted = metaOf(sink.records) as {
      left: { user: string }
      right: { user: string }
    }
    expect(redacted.left.user).toBe('[GIVEN_NAME_1]')
    expect(redacted.right.user).toBe('[GIVEN_NAME_1]')
  })

  test('delivers records in the order they were logged', async () => {
    const sink = createSink()
    let delay = 30
    const slowFirst: NeuralRedactor = {
      redaction: (text: string) => {
        const ms = delay
        delay = 0
        return new Promise(resolve => {
          setTimeout(() => resolve({ redactedText: text }), ms)
        })
      }
    }
    const transport = withRedaction(sink, slowFirst)

    transport.log('INFO', 'first')
    transport.log('INFO', 'second')
    await transport.flush()

    expect(sink.records.map(record => record.message)).toEqual([
      'first',
      'second'
    ])
  })

  test('drops the record and reports when redaction fails', async () => {
    const sink = createSink()
    const errors: unknown[] = []
    const transport = withRedaction(
      sink,
      { redaction: () => Promise.reject(new Error('model unavailable')) },
      { onError: error => errors.push(error) }
    )

    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(sink.records).toHaveLength(0)
    expect((errors[0] as Error).message).toBe('model unavailable')
  })

  test('forwards the raw record when onFailure is forward', async () => {
    const sink = createSink()
    const transport = withRedaction(
      sink,
      { redaction: () => Promise.reject(new Error('model unavailable')) },
      { onFailure: 'forward' }
    )

    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(sink.records[0]?.message).toBe('Anna Müller')
  })

  test('reports delivery failures without retrying unredacted data', async () => {
    const attempts: Recorded[] = []
    const errors: unknown[] = []
    const recoveringTransport: Transport = {
      log: (level, message, meta) => {
        attempts.push({ level, message, meta })
        if (attempts.length === 1) {
          return Promise.reject(new Error('transport unavailable'))
        }
      }
    }
    const transport = withRedaction(recoveringTransport, createStubRedactor(), {
      onError: error => errors.push(error),
      onFailure: 'forward'
    })

    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(attempts.map(attempt => attempt.message)).toEqual(['[GIVEN_NAME_1]'])
    expect((errors[0] as Error).message).toBe('transport unavailable')
  })

  test('drops rather than queues without bound past maxQueue', async () => {
    const sink = createSink()
    const errors: unknown[] = []
    const transport = withRedaction(sink, createStubRedactor(), {
      maxQueue: 1,
      onError: error => errors.push(error)
    })

    transport.log('INFO', 'first')
    transport.log('INFO', 'second')
    await transport.flush()

    expect(sink.records).toHaveLength(1)
    expect((errors[0] as Error).message).toContain('record dropped')
  })

  test('loads the model once, lazily, from a loader function', async () => {
    const sink = createSink()
    const redactor = createStubRedactor()
    let loads = 0
    const transport = withRedaction(sink, () => {
      loads += 1
      return Promise.resolve(redactor)
    })

    expect(loads).toBe(0)
    transport.log('INFO', 'Anna Müller')
    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(loads).toBe(1)
    expect(sink.records).toHaveLength(2)
  })

  test('reports a failed load without forwarding the record', async () => {
    const sink = createSink()
    const errors: unknown[] = []
    const transport = withRedaction(
      sink,
      () => Promise.reject(new Error('download failed')),
      { onError: error => errors.push(error) }
    )

    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(sink.records).toHaveLength(0)
    expect((errors[0] as Error).message).toBe('download failed')
  })

  test('passes labels, confidence and the call group to the model', async () => {
    const sink = createSink()
    const redactor = createStubRedactor({
      withCallGroup: body => body('group-1')
    })
    const transport = withRedaction(sink, redactor, {
      labels: ['EMAIL', 'PHONE'],
      minimumConfidence: 0.9
    })

    transport.log('INFO', 'ok', { user: 'Anna Müller' })
    await transport.flush()

    expect(redactor.calls).toHaveLength(2)
    for (const call of redactor.calls) {
      expect(call.options?.group).toBe('group-1')
      expect(call.options?.minimumConfidence).toBe(0.9)
      expect([...(call.options?.labels ?? [])]).toEqual(['EMAIL', 'PHONE'])
    }
  })

  test('flush drains the queue and then flushes the wrapped transport', async () => {
    const flushOrder: string[] = []
    const inner = {
      flush: () => {
        flushOrder.push('inner-flush')
        return Promise.resolve()
      },
      log: () => {
        flushOrder.push('log')
      }
    }
    const transport = withRedaction(inner, createStubRedactor())

    transport.log('INFO', 'Anna Müller')
    await transport.flush()

    expect(flushOrder).toEqual(['log', 'inner-flush'])
  })

  test('skips the model for empty strings', async () => {
    const sink = createSink()
    const redactor = createStubRedactor()
    const transport = withRedaction(sink, redactor)

    transport.log('INFO', '', { empty: '', n: 1 })
    await transport.flush()

    expect(redactor.calls).toHaveLength(0)
    expect(sink.records).toHaveLength(1)
  })
})
