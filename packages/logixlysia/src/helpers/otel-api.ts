import { createRequire } from 'node:module'

export interface OtelApi {
  context: { active: () => unknown }
  trace: {
    getSpan: (ctx: unknown) =>
      | {
          spanContext: () => {
            traceId: string
            spanId: string
            traceFlags?: number
          }
        }
      | undefined
  }
}

let otelApi: OtelApi | null | undefined

export const getOtelApi = (): OtelApi | null => {
  if (otelApi !== undefined) {
    return otelApi
  }
  try {
    // A CommonJS bundle leaves import.meta.url undefined and createRequire
    // throws, which reads the same as OpenTelemetry not being installed.
    const requireOtel = createRequire(import.meta.url)
    otelApi = requireOtel('@opentelemetry/api') as OtelApi
  } catch {
    otelApi = null
  }
  return otelApi
}

export const resetOtelApi = (): void => {
  otelApi = undefined
}
