import { getOtelApi } from './helpers/otel-api'
import type { Logger } from './interfaces'

export interface TraceContextFields {
  span_id?: string
  trace_id?: string
}

/**
 * Injects active OpenTelemetry span IDs into the request context bag when
 * `@opentelemetry/api` is installed and a span is active.
 */
export const injectTraceContext = (
  logger: Pick<Logger, 'mergeContext'>,
  request: Request
): TraceContextFields | undefined => {
  const api = getOtelApi()
  if (!api) {
    return
  }

  const span = api.trace.getSpan(api.context.active())
  if (!span) {
    return
  }

  const { traceId, spanId } = span.spanContext()
  const fields = {
    span_id: spanId,
    trace_id: traceId
  } satisfies TraceContextFields
  logger.mergeContext(request, fields)
  return fields
}
