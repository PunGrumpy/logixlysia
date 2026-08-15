import type { GlobalLogger } from "./interfaces";

/**
 * AI SDK / LLM usage metrics that can be attached to a request context for
 * observability dashboards.
 *
 * @public
 */
export interface AIMetrics {
  calls?: number;
  finishReason?: string;
  inputTokens?: number;
  model?: string;
  msToFinish?: number;
  msToFirstChunk?: number;
  outputTokens?: number;
  provider?: string;
  reasoningTokens?: number;
  tokensPerSecond?: number;
  totalTokens?: number;
}

/**
 * Merges AI SDK / LLM usage metrics into the request context bag so they appear
 * on the final access log (evlog-style `ai` object).
 *
 * 接受 GlobalLogger —— 无需手动传 request,GlobalLogger 自己从 ALS 拿
 * (若在请求作用域外,mergeContext 为 noop + warn 一次)。
 *
 * @public
 */
export const mergeAIMetrics = (
  logger: Pick<GlobalLogger, "mergeContext">,
  metrics: AIMetrics
): void => {
  if (Object.keys(metrics).length === 0) {
    return;
  }
  logger.mergeContext({ ai: metrics });
};
