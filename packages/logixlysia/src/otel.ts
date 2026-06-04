import { createRequire } from 'node:module'
import type { Logger } from './interfaces'

const requireOtel = createRequire(import.meta.url)

export interface TraceContextFields {
  span_id?: string
  trace_id?: string
}

interface OtelApi {
  context: { active: () => unknown }
  trace: {
    getSpan: (
      ctx: unknown
    ) => { spanContext: () => { traceId: string; spanId: string } } | undefined
  }
}

let otelApi: OtelApi | null | undefined

const getOtelApi = (): OtelApi | null => {
  if (otelApi !== undefined) {
    return otelApi
  }
  try {
    otelApi = requireOtel('@opentelemetry/api') as OtelApi
  } catch {
    otelApi = null
  }
  return otelApi
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
    trace_id: traceId,
    span_id: spanId
  } satisfies TraceContextFields
  logger.mergeContext(request, fields)
  return fields
}

/** @internal Reset the cached OTel API reference. Only intended for tests. */
export const __resetForTesting = (): void => {
  otelApi = undefined
}

export { injectTraceContext as default }
