import {
  createHttpTransport,
  defaultBody,
  flattenMeta,
  getPath,
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

const TRACE_ID = /^[\da-f]{32}$/u
const SPAN_ID = /^[\da-f]{16}$/u
const TRACE_FLAGS = /^[\da-f]{2}$/u
const ZERO_TRACE_ID = '0'.repeat(32)
const ZERO_SPAN_ID = '0'.repeat(16)
const HEX_RADIX = 16

const hexId = (
  value: unknown,
  pattern: RegExp,
  zero: string
): string | undefined => {
  if (typeof value !== 'string') {
    return
  }
  const id = value.toLowerCase()
  return pattern.test(id) && id !== zero ? id : undefined
}

const traceFlags = (value: unknown): number | undefined => {
  if (typeof value !== 'string') {
    return
  }
  const hex = value.toLowerCase()
  return TRACE_FLAGS.test(hex) ? Number.parseInt(hex, HEX_RADIX) : undefined
}

interface OtlpTraceFields {
  flags?: number
  spanId?: string
  traceId?: string
}

const traceFields = (meta: Record<string, unknown>): OtlpTraceFields => {
  const traceId = hexId(
    getPath(meta, 'context.trace_id'),
    TRACE_ID,
    ZERO_TRACE_ID
  )
  const spanId = hexId(getPath(meta, 'context.span_id'), SPAN_ID, ZERO_SPAN_ID)
  const flags = traceFlags(getPath(meta, 'context.trace_flags'))
  return {
    ...(traceId && { traceId }),
    ...(spanId && { spanId }),
    ...(traceId && flags !== undefined && { flags })
  }
}

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
                ...traceFields(entry.meta),
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
