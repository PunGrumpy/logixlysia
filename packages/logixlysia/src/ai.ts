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

/**
 * Merges AI SDK / LLM usage metrics into the request context bag so they appear
 * on the final access log (evlog-style `ai` object).
 */
export const mergeAIMetrics = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request,
  metrics: AIMetrics
): void => {
  if (Object.keys(metrics).length === 0) {
    return
  }
  logger.mergeContext(request, { ai: metrics })
}

export { mergeAIMetrics as default }
