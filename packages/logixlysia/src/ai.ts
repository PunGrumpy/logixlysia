import { LINE_SETTLED } from './context/line-settled'
import type { Logger, RequestScopedLogger } from './interfaces'

export interface AIMetrics {
  calls?: number
  /**
   * Calls that failed: the call rejected, its stream failed or ended without
   * a finish, or its finish reason was `error`.
   */
  errors?: number
  finishReason?: string
  inputTokens?: number
  model?: string
  msToFinish?: number
  msToFirstChunk?: number
  outputTokens?: number
  provider?: string
  reasoningTokens?: number
  tokensPerSecond?: number
  totalTokens?: number
}

const COMBINE: Record<keyof AIMetrics, 'last' | 'sum'> = {
  calls: 'sum',
  errors: 'sum',
  finishReason: 'last',
  inputTokens: 'sum',
  model: 'last',
  msToFinish: 'sum',
  msToFirstChunk: 'last',
  outputTokens: 'sum',
  provider: 'last',
  reasoningTokens: 'sum',
  tokensPerSecond: 'last',
  totalTokens: 'sum'
}

type Totals = Map<string, number | string>

const totals = new WeakMap<object, Totals>()

const foldMetrics = (total: Totals, metrics: AIMetrics): void => {
  const incoming = new Map<string, unknown>(Object.entries(metrics))
  if (typeof incoming.get('calls') !== 'number') {
    incoming.set('calls', 1)
  }
  for (const [key, rule] of Object.entries(COMBINE)) {
    const value = incoming.get(key)
    if (typeof value !== 'number' && typeof value !== 'string') {
      continue
    }
    const previous = total.get(key)
    total.set(
      key,
      rule === 'sum' &&
        typeof previous === 'number' &&
        typeof value === 'number'
        ? previous + value
        : value
    )
  }
}

type MergeAIMetricsArgs =
  | [log: Pick<RequestScopedLogger, 'mergeContext'>, metrics: AIMetrics]
  | [logger: Pick<Logger, 'mergeContext'>, request: Request, metrics: AIMetrics]

const foldInto = (
  scope: object,
  metrics: AIMetrics
): Record<string, number | string> | undefined => {
  if (Object.keys(metrics).length === 0) {
    return
  }
  const total: Totals = totals.get(scope) ?? new Map()
  foldMetrics(total, metrics)
  totals.set(scope, total)
  return Object.fromEntries(total)
}

/**
 * Adds LLM usage to the request's context, under `ai`, for its next log line.
 * Several calls in one request accumulate: counts and durations are summed,
 * descriptive fields keep the last call's value.
 *
 * Takes the handler's `log`, or the plugin's `store.logger` with the request.
 */
export const mergeAIMetrics = (...args: MergeAIMetricsArgs): void => {
  if (args.length === 2) {
    const [log, metrics] = args
    const ai = foldInto(log, metrics)
    if (ai) {
      log.mergeContext({ ai })
    }
    return
  }
  const [logger, request, metrics] = args
  const ai = foldInto(request, metrics)
  if (ai) {
    logger.mergeContext(request, { ai })
  }
}

interface AIUsage {
  inputTokens: { total: number | undefined }
  outputTokens: { reasoning: number | undefined; total: number | undefined }
}

interface AIModelRef {
  modelId: string
  provider: string
}

interface AIFinish {
  finishReason: { unified: string }
  usage: AIUsage
}

interface AIStreamChunk extends Partial<AIFinish> {
  type: string
}

/** Fits the AI SDK's `LanguageModelMiddleware` without importing the SDK. */
export interface AIMiddleware {
  wrapGenerate: <T extends AIFinish>(options: {
    doGenerate: () => PromiseLike<T>
    model: AIModelRef
  }) => Promise<T>
  wrapStream: <T extends { stream: ReadableStream<AIStreamChunk> }>(options: {
    doStream: () => PromiseLike<T>
    model: AIModelRef
  }) => Promise<T>
}

type AILog = Pick<RequestScopedLogger, 'info' | 'mergeContext' | 'warn'>

const MS_PER_SECOND = 1000

const isFinishChunk = (
  chunk: AIStreamChunk
): chunk is AIStreamChunk & AIFinish => chunk.type === 'finish'

const isLineSettled = (log: object): boolean =>
  LINE_SETTLED in log &&
  typeof log[LINE_SETTLED] === 'function' &&
  log[LINE_SETTLED]() === true

const recordCall = (
  log: AILog,
  model: AIModelRef,
  { finishReason, usage }: AIFinish,
  startedAt: number,
  msToFirstChunk?: number
): void => {
  try {
    const inputTokens = usage.inputTokens.total
    const outputTokens = usage.outputTokens.total
    const msToFinish = performance.now() - startedAt
    const msStreaming =
      msToFirstChunk === undefined ? 0 : msToFinish - msToFirstChunk
    const failed = finishReason.unified === 'error'
    mergeAIMetrics(log, {
      errors: failed ? 1 : undefined,
      finishReason: finishReason.unified,
      inputTokens,
      model: model.modelId,
      msToFinish,
      msToFirstChunk,
      outputTokens,
      provider: model.provider,
      reasoningTokens: usage.outputTokens.reasoning,
      tokensPerSecond:
        outputTokens !== undefined && msStreaming > 0
          ? outputTokens / (msStreaming / MS_PER_SECOND)
          : undefined,
      totalTokens:
        inputTokens !== undefined && outputTokens !== undefined
          ? inputTokens + outputTokens
          : undefined
    })
    if (isLineSettled(log)) {
      if (failed) {
        log.warn('ai call failed')
      } else {
        log.info('ai call finished')
      }
    }
  } catch {
    // A logging failure must not fail the model call it observes.
  }
}

const recordFailure = (
  log: AILog,
  model: AIModelRef,
  startedAt: number
): void => {
  try {
    mergeAIMetrics(log, {
      calls: 1,
      errors: 1,
      finishReason: 'error',
      model: model.modelId,
      msToFinish: performance.now() - startedAt,
      provider: model.provider
    })
    if (isLineSettled(log)) {
      log.warn('ai call failed')
    }
  } catch {
    // A logging failure must not hide the model error it observes.
  }
}

const awaitRecordingFailure = async <T>(
  log: AILog,
  model: AIModelRef,
  call: () => PromiseLike<T>
): Promise<{ result: T; startedAt: number }> => {
  const startedAt = performance.now()
  try {
    return { result: await call(), startedAt }
  } catch (error) {
    recordFailure(log, model, startedAt)
    throw error
  }
}

/**
 * Records every call of a wrapped AI SDK model on the request's log, streams
 * included: `wrapLanguageModel({ model, middleware: aiMiddleware(log) })`.
 *
 * Usage lands on the request's line. A call that finishes after that line was
 * written, or after a custom line replaced it, writes its own line.
 */
export const aiMiddleware = (log: AILog): AIMiddleware => ({
  wrapGenerate: async ({ doGenerate, model }) => {
    const { result, startedAt } = await awaitRecordingFailure(
      log,
      model,
      doGenerate
    )
    recordCall(log, model, result, startedAt)
    return result
  },
  wrapStream: async ({ doStream, model }) => {
    const { result, startedAt } = await awaitRecordingFailure(
      log,
      model,
      doStream
    )
    const reader = result.stream.getReader()
    let finish: AIFinish | undefined
    let msToFirstChunk: number | undefined
    let settled = false
    const settle = (): void => {
      if (settled) {
        return
      }
      settled = true
      if (finish) {
        recordCall(log, model, finish, startedAt, msToFirstChunk)
      } else {
        recordFailure(log, model, startedAt)
      }
    }
    // Bun 1.3 never calls a TransformStream's cancel, so a transformer cannot
    // see the source fail; reading the source directly can.
    const stream = new ReadableStream<AIStreamChunk>({
      cancel: reason => {
        // The cancel ends a pending read as done: the client left, the call
        // did not fail. Once the finish chunk was read, the call completed
        // and its usage is known, so it is still recorded.
        if (finish) {
          settle()
        }
        settled = true
        return reader.cancel(reason)
      },
      pull: async controller => {
        let next: Awaited<ReturnType<typeof reader.read>>
        try {
          next = await reader.read()
        } catch (error) {
          settle()
          controller.error(error)
          return
        }
        if (next.done) {
          settle()
          controller.close()
          return
        }
        const chunk = next.value
        if (msToFirstChunk === undefined && chunk.type === 'text-delta') {
          msToFirstChunk = performance.now() - startedAt
        }
        if (isFinishChunk(chunk)) {
          finish = chunk
        }
        controller.enqueue(chunk)
      }
    })
    return { ...result, stream }
  }
})
