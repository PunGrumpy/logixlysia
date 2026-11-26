import type { LogLevel, Options } from '../interfaces'
import type { PrecomputedLogParts } from '../logger/create-logger'
import { stringifyForLog } from '../utils/json'
import type { LoggedRequest } from '../utils/redact'
import { configuredService, toRecordMeta } from './index'

export const LINE_OWNED_KEYS: ReadonlySet<string> = new Set([
  'level',
  'message',
  'timestamp'
])

export const formatJsonLine = (
  level: LogLevel,
  data: Record<string, unknown>,
  request: LoggedRequest,
  precomputed: PrecomputedLogParts,
  options: Options
): string => {
  const {
    context,
    durationMs,
    error,
    request: requestMeta,
    status,
    ...rest
  } = toRecordMeta({ data, options, precomputed, request })
  const service = configuredService(options)
  const { message } = data
  const restEntries = Object.entries(rest).filter(
    ([key]) =>
      !(
        LINE_OWNED_KEYS.has(key) ||
        (service !== undefined && key === 'service')
      )
  )
  // Entries, not an object literal, because `bun run format` sorts literal
  // keys and this order is the line's key order.
  return stringifyForLog(
    Object.fromEntries([
      ['timestamp', new Date().toISOString()],
      ['level', level],
      ...(service === undefined ? [] : [['service', service]]),
      ['message', typeof message === 'string' ? message : ''],
      ['request', requestMeta],
      ['status', status],
      ['durationMs', durationMs],
      ['context', context],
      ['error', error],
      ...restEntries
    ])
  )
}
