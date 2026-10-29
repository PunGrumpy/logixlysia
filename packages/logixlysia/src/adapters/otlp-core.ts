import {
  createHttpTransport,
  defaultBody,
  flattenMeta,
  OTEL_SEVERITY,
  toUnixNanos
} from './shared'
import type {
  AdapterTransport,
  BatchTransportOptions,
  FlatValue,
  LogEntry
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
    return Number.isSafeInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value }
  }
  return { stringValue: value }
}

const toOtlpAttributes = (
  flat: Record<string, FlatValue>
): { key: string; value: OtlpAnyValue }[] =>
  Object.entries(flat).map(([key, value]) => ({
    key,
    value: toOtlpValue(value)
  }))

export interface OtlpCoreInput {
  headers: Record<string, string>
  name: string
  options: BatchTransportOptions
  resourceAttributes: Record<string, string>
  serviceName: string
  url: string
}

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
