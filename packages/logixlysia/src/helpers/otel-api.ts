import { createRequire } from 'node:module'

export interface OtelApi {
  context: { active: () => unknown }
  trace: {
    getSpan: (
      ctx: unknown
    ) => { spanContext: () => { traceId: string; spanId: string } } | undefined
  }
}

const requireOtel = createRequire(import.meta.url)

let otelApi: OtelApi | null | undefined

export const getOtelApi = (): OtelApi | null => {
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

export const resetOtelApi = (): void => {
  otelApi = undefined
}
