import { getOtelApi } from './helpers/otel-api'
import type { Logger } from './interfaces'
import type { Enricher } from './types/enricher'

export interface TraceContextFields {
  span_id?: string
  trace_id?: string
}

const activeSpanFields = () => {
  const api = getOtelApi()
  if (!api) {
    return
  }

  const span = api.trace.getSpan(api.context.active())
  if (!span) {
    return
  }

  const { traceId, spanId } = span.spanContext()
  return { span_id: spanId, trace_id: traceId } satisfies TraceContextFields
}

/**
 * Injects active OpenTelemetry span IDs into the request context bag when
 * `@opentelemetry/api` is installed and a span is active.
 */
export const injectTraceContext = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request
): TraceContextFields | undefined => {
  const fields = activeSpanFields()
  if (fields) {
    logger.mergeContext(request, fields)
  }
  return fields
}

/**
 * An enricher that adds the active OpenTelemetry span IDs to every request's
 * context. Use it through `config.enrichers`.
 */
export const otelEnricher = (): Enricher => ({
  request: () => activeSpanFields()
})
