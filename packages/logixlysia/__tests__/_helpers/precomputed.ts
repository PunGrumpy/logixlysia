import type { PrecomputedLogParts } from '../../src/logger/create-logger'
import { parseRequestUrlOnce } from '../../src/logger/emit'
import type { LoggedRequest } from '../../src/utils/redact'

export const precomputedFor = (
  request: LoggedRequest,
  durationMs = 0
): PrecomputedLogParts => ({ durationMs, ...parseRequestUrlOnce(request) })
