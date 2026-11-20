import { getOtelApi } from './helpers/otel-api'
import type { Logger } from './interfaces'
import type { Enricher } from './types/enricher'

export interface TraceContextFields {
  span_id?: string
  /** The span's flags byte as two lowercase hex digits, as in a `traceparent` header. */
  trace_flags?: string
  trace_id?: string
  trace_sampled?: boolean
}

const HEX_RADIX = 16
const MAX_TRACE_FLAGS = 0xff

const flagFields = (
  traceFlags: unknown
): Pick<TraceContextFields, 'trace_flags' | 'trace_sampled'> | undefined => {
  if (
    typeof traceFlags !== 'number' ||
    !Number.isInteger(traceFlags) ||
    traceFlags < 0 ||
    traceFlags > MAX_TRACE_FLAGS
  ) {
    return
  }
  return {
    trace_flags: traceFlags.toString(HEX_RADIX).padStart(2, '0'),
    trace_sampled: traceFlags % 2 === 1
  }
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

  const { traceId, spanId, traceFlags } = span.spanContext()
  return {
    span_id: spanId,
    trace_id: traceId,
    ...flagFields(traceFlags)
  } satisfies TraceContextFields
}

/**
 * Injects the active OpenTelemetry span's ids and trace flags into the
 * request context bag when `@opentelemetry/api` is installed and a span is
 * active.
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
 * An enricher that adds the active OpenTelemetry span's ids and trace flags
 * to every request's context. Use it through `config.enrichers`.
 */
export const otelEnricher = (): Enricher => ({
  request: () => activeSpanFields()
})
