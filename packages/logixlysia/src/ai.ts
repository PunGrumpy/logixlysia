import type { Logger } from './interfaces'

export interface AIMetrics {
  calls?: number
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

const totals = new WeakMap<Request, Totals>()

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

/**
 * Merges AI SDK / LLM usage metrics into the request context bag so they appear
 * on the final access log (evlog-style `ai` object). Several calls in one
 * request accumulate: counts and durations are summed, descriptive fields keep
 * the last call's value.
 */
export const mergeAIMetrics = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request,
  metrics: AIMetrics
): void => {
  if (Object.keys(metrics).length === 0) {
    return
  }
  const total: Totals = totals.get(request) ?? new Map()
  foldMetrics(total, metrics)
  totals.set(request, total)
  logger.mergeContext(request, { ai: Object.fromEntries(total) })
}
