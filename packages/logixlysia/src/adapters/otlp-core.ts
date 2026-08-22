import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  defaultBody,
  type FlatValue,
  flattenMeta,
  type LogEntry,
  OTEL_SEVERITY,
  toUnixNanos
} from './shared'

interface OtlpAnyValue {
  boolValue?: boolean
  doubleValue?: number
  intValue?: string
  stringValue?: string
}

const toOtlpValue = (value: FlatValue): OtlpAnyValue => {
  if (typeof value === 'boolean') {
    return { boolValue: value }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value }
  }
  return { stringValue: value }
}

const toOtlpAttributes = (
  flat: Record<string, FlatValue>
): Array<{ key: string; value: OtlpAnyValue }> =>
  Object.entries(flat).map(([key, value]) => ({
    key,
    value: toOtlpValue(value)
  }))

export interface OtlpCoreInput {
  headers: Record<string, string>
  /** Adapter name used in error messages, e.g. 'OTLP' or 'HyperDX'. */
  name: string
  options: BatchTransportOptions
  resourceAttributes: Record<string, string>
  serviceName: string
  /** Full OTLP logs URL, e.g. `https://collector:4318/v1/logs`. */
  url: string
}

/**
 * Shared OTLP-logs transport core: builds an `ExportLogsServiceRequest` JSON
 * payload and POSTs it to the logs URL. Backs both the generic
 * `logixlysia/otlp` adapter and vendor wrappers like `logixlysia/hyperdx`.
 */
export const createOtlpCore = (input: OtlpCoreInput): AdapterTransport => {
  const resourceAttributes = toOtlpAttributes({
    'service.name': input.serviceName,
    ...input.resourceAttributes
  })

  const body = (entries: LogEntry[]): string =>
    JSON.stringify({
      resourceLogs: [
        {
          resource: { attributes: resourceAttributes },
          scopeLogs: [
            {
              logRecords: entries.map(entry => ({
                attributes: toOtlpAttributes(flattenMeta(entry.meta)),
                body: { stringValue: defaultBody(entry) },
                severityNumber: OTEL_SEVERITY[entry.level],
                severityText: entry.level,
                timeUnixNano: toUnixNanos(entry.timestamp)
              })),
              scope: { name: 'logixlysia' }
            }
          ]
        }
      ]
    })

  return createHttpTransport({
    body,
    headers: {
      'Content-Type': 'application/json',
      ...input.headers
    },
    name: input.name,
    options: input.options,
    url: input.url
  })
}
