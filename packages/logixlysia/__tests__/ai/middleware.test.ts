import { describe, expect, mock, test } from 'bun:test'
import { generateText, streamText, wrapLanguageModel } from 'ai'
import type { LanguageModelMiddleware } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { Elysia } from 'elysia'
import { logixlysia, useLogger } from '../../src'
import { aiMiddleware, mergeAIMetrics } from '../../src/ai'
import type { RequestScopedLogger } from '../../src/interfaces'
import { waitFor } from '../_helpers/wait-for'

interface CapturedLine {
  ai?: Record<string, unknown>
  level?: string
  message: string
  method?: string
  status?: number
}

const usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 12, total: 12 },
  outputTokens: { reasoning: 1, text: 4, total: 5 }
}
const finishReason = { raw: 'stop', unified: 'stop' } as const

const streamChunks = [
  { type: 'stream-start' as const, warnings: [] },
  { id: '1', type: 'text-start' as const },
  { delta: 'he', id: '1', type: 'text-delta' as const },
  { delta: 'llo', id: '1', type: 'text-delta' as const },
  { id: '1', type: 'text-end' as const },
  { finishReason, type: 'finish' as const, usage }
]

const mockModel = (): MockLanguageModelV4 =>
  new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ text: 'hi', type: 'text' }],
        finishReason,
        usage,
        warnings: []
      }),
    doStream: () =>
      Promise.resolve({
        stream: simulateReadableStream({
          chunkDelayInMs: 5,
          chunks: streamChunks,
          initialDelayInMs: 5
        })
      }),
    modelId: 'mock-model',
    provider: 'mock-provider'
  })

const wrapped = (log: RequestScopedLogger, model = mockModel()) =>
  wrapLanguageModel({ middleware: aiMiddleware(log), model })

const capturingPlugin = (useAsyncLocalStorage = false) => {
  const lines: CapturedLine[] = []
  const plugin = logixlysia({
    config: {
      transports: [
        {
          log: (level, message, meta) => {
            const context = meta?.context as
              | { ai?: Record<string, unknown> }
              | undefined
            lines.push({
              ai: context?.ai,
              level,
              message,
              method: (meta?.request as { method?: string } | undefined)
                ?.method,
              status: meta?.status as number | undefined
            })
          }
        }
      ],
      useAsyncLocalStorage,
      useTransportsOnly: true
    }
  })
  return { lines, plugin }
}

const post = (path: string): Request =>
  new Request(`http://localhost${path}`, { method: 'POST' })

const rejectingModel = (): MockLanguageModelV4 =>
  new MockLanguageModelV4({
    doGenerate: () => Promise.reject(new Error('model down')),
    modelId: 'mock-model',
    provider: 'mock-provider'
  })

const mockLog = () => ({ info: mock(), mergeContext: mock(), warn: mock() })

const failedCallMessage = async (log: RequestScopedLogger): Promise<string> => {
  try {
    await generateText({ model: wrapped(log, rejectingModel()), prompt: 'x' })
    return 'unreachable'
  } catch (error) {
    return (error as Error).message
  }
}

describe('aiMiddleware', () => {
  test('generateText lands on the access line', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      const { text } = await generateText({
        model: wrapped(log),
        prompt: 'x'
      })
      return text
    })

    await app.handle(post('/'))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.status).toBe(200)
    expect(lines[0]?.ai).toMatchObject({
      calls: 1,
      finishReason: 'stop',
      inputTokens: 12,
      model: 'mock-model',
      outputTokens: 5,
      provider: 'mock-provider',
      reasoningTokens: 1,
      totalTokens: 17
    })
    expect(lines[0]?.ai?.msToFinish).toBeGreaterThanOrEqual(0)
    expect(lines[0]?.ai?.msToFirstChunk).toBeUndefined()
  })

  test('two calls in one request sum', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      const model = wrapped(log)
      await generateText({ model, prompt: 'x' })
      await generateText({ model, prompt: 'y' })
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.ai).toMatchObject({
      calls: 2,
      inputTokens: 24,
      outputTokens: 10,
      totalTokens: 34
    })
  })

  test('calls through log and useLogger count together', async () => {
    const { lines, plugin } = capturingPlugin(true)
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      await generateText({ model: wrapped(log), prompt: 'x' })
      await generateText({ model: wrapped(useLogger()), prompt: 'y' })
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.ai).toMatchObject({ calls: 2, inputTokens: 24 })
  })

  test('a generator route lands on the access line', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia()
      .use(plugin)
      .post('/', async function* route({ log }) {
        const { textStream } = streamText({ model: wrapped(log), prompt: 'x' })
        for await (const delta of textStream) {
          yield delta
        }
      })

    const response = await app.handle(post('/'))
    await response.text()
    await waitFor(() => lines.length > 0)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.status).toBe(200)
    expect(lines[0]?.ai).toMatchObject({ calls: 1, inputTokens: 12 })
    expect(lines[0]?.ai?.msToFirstChunk).toBeGreaterThan(0)
    expect(lines[0]?.ai?.tokensPerSecond).toBeGreaterThan(0)
  })

  test('a custom log first is followed by a line carrying the usage', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      log.info('calling')
      await generateText({ model: wrapped(log), prompt: 'x' })
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines.map(line => line.message)).toEqual([
      'calling',
      'ai call finished'
    ])
    expect(lines[0]?.ai).toBeUndefined()
    expect(lines[1]?.ai).toMatchObject({ calls: 1, inputTokens: 12 })
  })

  test('toTextStreamResponse writes the usage after the access line', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia()
      .use(plugin)
      .post('/', ({ log }) =>
        streamText({ model: wrapped(log), prompt: 'x' }).toTextStreamResponse()
      )

    const response = await app.handle(post('/'))
    const text = await response.text()
    await waitFor(() => lines.length > 1)

    expect(text).toBe('hello')
    expect(lines).toHaveLength(2)
    expect(lines[0]?.status).toBe(200)
    expect(lines[0]?.ai).toBeUndefined()
    expect(lines[1]?.message).toBe('ai call finished')
    expect(lines[1]?.ai).toMatchObject({
      calls: 1,
      inputTokens: 12,
      outputTokens: 5
    })
  })

  test('a job that logs first reports usage only on its JOB line', async () => {
    const { lines, plugin } = capturingPlugin()

    await plugin.runJob('nightly', async log => {
      log.info('starting')
      await generateText({ model: wrapped(log), prompt: 'x' })
    })

    expect(lines.map(line => line.message)).toEqual(['starting', ''])
    const withUsage = lines.filter(line => line.ai !== undefined)
    expect(withUsage).toHaveLength(1)
    expect(withUsage[0]?.method).toBe('JOB')
    expect(withUsage[0]?.ai).toMatchObject({ calls: 1, inputTokens: 12 })
  })

  test('a call that outlives its job writes its own line', async () => {
    const { lines, plugin } = capturingPlugin()
    let jobLog: RequestScopedLogger | undefined
    await plugin.runJob('nightly', log => {
      jobLog = log
    })
    if (!jobLog) {
      throw new Error('the job never ran')
    }

    await generateText({ model: wrapped(jobLog), prompt: 'x' })

    expect(lines).toHaveLength(2)
    expect(lines[0]?.ai).toBeUndefined()
    expect(lines[1]?.message).toBe('ai call finished')
    expect(lines[1]?.ai).toMatchObject({ calls: 1, inputTokens: 12 })
  })

  test('a stream reaches the caller unchanged', async () => {
    const log = mockLog()
    const { stream } = await aiMiddleware(log).wrapStream({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunkDelayInMs: null,
            chunks: streamChunks,
            initialDelayInMs: null
          })
        }),
      model: { modelId: 'm', provider: 'p' }
    })

    expect(await Array.fromAsync(stream)).toEqual(streamChunks)
    expect(log.mergeContext).toHaveBeenCalledTimes(1)
  })

  test('a stream with no finish chunk is recorded as a failure', async () => {
    const log = mockLog()
    const { stream } = await aiMiddleware(log).wrapStream({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunkDelayInMs: null,
            chunks: streamChunks.slice(0, -1),
            initialDelayInMs: null
          })
        }),
      model: { modelId: 'm', provider: 'p' }
    })

    await Array.fromAsync(stream)

    expect(log.mergeContext).toHaveBeenCalledTimes(1)
    expect(log.mergeContext).toHaveBeenCalledWith({
      ai: expect.objectContaining({
        calls: 1,
        errors: 1,
        finishReason: 'error'
      })
    })
  })

  test('a rejected doStream reaches the caller and is recorded', async () => {
    const log = mockLog()

    const call = aiMiddleware(log).wrapStream({
      doStream: () => Promise.reject(new Error('401')),
      model: { modelId: 'm', provider: 'p' }
    })

    await expect(call).rejects.toThrow('401')
    expect(log.mergeContext).toHaveBeenCalledWith({
      ai: expect.objectContaining({ errors: 1 })
    })
  })

  test('an error part with no finish is recorded as a failure and the part reaches the caller', async () => {
    const log = mockLog()
    const chunks = [
      { type: 'stream-start' as const, warnings: [] },
      { error: new Error('overloaded'), type: 'error' as const }
    ]
    const { stream } = await aiMiddleware(log).wrapStream({
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunkDelayInMs: null,
            chunks,
            initialDelayInMs: null
          })
        }),
      model: { modelId: 'm', provider: 'p' }
    })

    expect(await Array.fromAsync(stream)).toEqual(chunks)
    expect(log.mergeContext).toHaveBeenCalledWith({
      ai: expect.objectContaining({ errors: 1, finishReason: 'error' })
    })
  })

  test('a source stream that fails mid-way is recorded and the failure reaches the caller', async () => {
    const log = mockLog()
    const { stream } = await aiMiddleware(log).wrapStream({
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream({
            start: controller => {
              for (const chunk of streamChunks.slice(0, 3)) {
                controller.enqueue(chunk)
              }
              controller.error(new Error('socket hang up'))
            }
          })
        }),
      model: { modelId: 'm', provider: 'p' }
    })

    await expect(Array.fromAsync(stream)).rejects.toThrow('socket hang up')
    expect(log.mergeContext).toHaveBeenCalledWith({
      ai: expect.objectContaining({ errors: 1 })
    })
  })

  test('a stream the client cancels mid-way records nothing', async () => {
    const log = mockLog()
    const readWaiting: PromiseWithResolvers<void> = Promise.withResolvers()
    const { stream } = await aiMiddleware(log).wrapStream({
      doStream: () =>
        Promise.resolve({
          // With highWaterMark 0, pull runs only while a read is waiting.
          stream: new ReadableStream(
            {
              pull: () => {
                readWaiting.resolve()
              },
              start: controller => {
                controller.enqueue(streamChunks[0])
              }
            },
            { highWaterMark: 0 }
          )
        }),
      model: { modelId: 'm', provider: 'p' }
    })
    const reader = stream.getReader()

    await reader.read()
    await readWaiting.promise
    await reader.cancel(new Error('client went away'))

    expect(log.mergeContext).not.toHaveBeenCalled()
  })

  test('fits LanguageModelMiddleware, whatever fields the log is typed with', () => {
    const log: RequestScopedLogger<{ cartId: string }> = {
      debug: mock(),
      error: mock(),
      info: mock(),
      mergeContext: mock(),
      warn: mock()
    }

    const middleware: LanguageModelMiddleware = aiMiddleware(log)

    expect(middleware.wrapGenerate).toBeFunction()
    expect(middleware.wrapStream).toBeFunction()
  })

  test('a rejected model call reaches the caller and is recorded as a failure', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia()
      .use(plugin)
      .post('/', ({ log }) => failedCallMessage(log))

    const response = await app.handle(post('/'))

    expect(await response.text()).toBe('model down')
    expect(lines[0]?.ai).toMatchObject({
      calls: 1,
      errors: 1,
      finishReason: 'error',
      model: 'mock-model',
      provider: 'mock-provider'
    })
    expect(lines[0]?.ai?.msToFinish).toBeGreaterThanOrEqual(0)
  })

  test('a failed call then a successful one give calls 2, errors 1, finishReason stop', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      const failure = await failedCallMessage(log)
      await generateText({ model: wrapped(log), prompt: 'y' })
      return failure
    })

    await app.handle(post('/'))

    expect(lines[0]?.ai).toMatchObject({
      calls: 2,
      errors: 1,
      finishReason: 'stop',
      inputTokens: 12
    })
  })

  test('a failure after a custom line writes ai call failed at WARNING', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', ({ log }) => {
      log.info('calling')
      return failedCallMessage(log)
    })

    await app.handle(post('/'))

    expect(lines.map(line => line.message)).toEqual([
      'calling',
      'ai call failed'
    ])
    expect(lines[1]?.level).toBe('WARNING')
    expect(lines[1]?.ai?.errors).toBe(1)
  })

  test('a finish with reason error counts as an error', async () => {
    const { lines, plugin } = capturingPlugin()
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        Promise.resolve({
          content: [],
          finishReason: { raw: 'error', unified: 'error' },
          usage,
          warnings: []
        })
    })
    const app = new Elysia().use(plugin).post('/', async ({ log }) => {
      await generateText({ model: wrapped(log, model), prompt: 'x' })
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines[0]?.ai).toMatchObject({
      calls: 1,
      errors: 1,
      finishReason: 'error',
      inputTokens: 12
    })
  })

  test('a failure while recording leaves the model call intact', async () => {
    const log = {
      info: mock(),
      mergeContext: () => {
        throw new Error('sink down')
      },
      warn: mock()
    }

    const { text } = await generateText({
      model: wrapLanguageModel({
        middleware: aiMiddleware(log),
        model: mockModel()
      }),
      prompt: 'x'
    })

    expect(text).toBe('hi')
  })
})

describe('mergeAIMetrics', () => {
  test('takes the handler log and reaches the access line', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', ({ log }) => {
      mergeAIMetrics(log, { inputTokens: 3, model: 'a' })
      mergeAIMetrics(log, { inputTokens: 4, model: 'b' })
      mergeAIMetrics(log, {})
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines).toHaveLength(1)
    expect(lines[0]?.ai).toEqual({ calls: 2, inputTokens: 7, model: 'b' })
  })

  test('still takes store.logger with the request', async () => {
    const { lines, plugin } = capturingPlugin()
    const app = new Elysia().use(plugin).post('/', ({ request, store }) => {
      mergeAIMetrics(store.logger, request, { inputTokens: 3 })
      return 'ok'
    })

    await app.handle(post('/'))

    expect(lines[0]?.ai).toEqual({ calls: 1, inputTokens: 3 })
  })
})
