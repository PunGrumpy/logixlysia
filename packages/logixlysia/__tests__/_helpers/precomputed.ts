import type { PrecomputedLogParts } from '../../src/logger/create-logger'
import type { LoggedRequest } from '../../src/utils/redact'
import { parseRequestUrlOnce } from '../../src/utils/request-url'

export const precomputedFor = (
  request: LoggedRequest,
  durationMs = 0
): PrecomputedLogParts => ({ durationMs, ...parseRequestUrlOnce(request) })
