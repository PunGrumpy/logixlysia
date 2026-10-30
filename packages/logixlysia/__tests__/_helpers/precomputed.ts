import type { RequestInfo } from '../../src/interfaces'
import type { PrecomputedLogParts } from '../../src/logger/create-logger'
import { parseRequestUrlOnce } from '../../src/logger/emit'

export const precomputedFor = (
  request: RequestInfo,
  durationMs = 0
): PrecomputedLogParts => ({ durationMs, ...parseRequestUrlOnce(request) })
