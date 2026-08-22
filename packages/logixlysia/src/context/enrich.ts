import type {
  EnricherFields,
  EnricherLike,
  EnricherResponseInput,
  SinkErrorContext
} from '../interfaces'
import { createErrorReporter } from '../utils/report'
import type { RequestContextStore } from './request-context'

const reportEnricherError = createErrorReporter('enricher', 'enricher failed')

type RequestPhase = (request: Request) => EnricherFields
type ResponsePhase = (input: EnricherResponseInput) => EnricherFields

/** Enricher phases split so each request only walks the hooks that exist. */
export interface ResolvedEnrichers {
  request: RequestPhase[]
  response: ResponsePhase[]
}

/** Splits configured enrichers by phase, or `undefined` when there are none. */
export const resolveEnrichers = (
  enrichers?: EnricherLike[]
): ResolvedEnrichers | undefined => {
  if (!enrichers?.length) {
    return
  }

  const request: RequestPhase[] = []
  const response: ResponsePhase[] = []

  for (const enricher of enrichers) {
    if (typeof enricher === 'function') {
      request.push(enricher)
      continue
    }
    if (enricher.request) {
      request.push(enricher.request)
    }
    if (enricher.response) {
      response.push(enricher.response)
    }
  }

  return request.length === 0 && response.length === 0
    ? undefined
    : { request, response }
}

/**
 * Runs one phase and merges what it returns into the request context. A hook
 * that throws is reported and skipped: enrichment is decoration, and must
 * never take a request down with it.
 */
const runPhase = <TInput>(
  hooks: ((input: TInput) => EnricherFields)[],
  input: TInput,
  contextStore: RequestContextStore,
  key: Request,
  onError?: (context: SinkErrorContext) => void
): void => {
  for (const hook of hooks) {
    let fields: EnricherFields
    try {
      fields = hook(input)
    } catch (error) {
      reportEnricherError(error, onError)
      continue
    }
    if (fields) {
      contextStore.mergeContext(key, fields)
    }
  }
}

export const applyRequestEnrichers = (
  enrichers: ResolvedEnrichers,
  contextStore: RequestContextStore,
  request: Request,
  onError?: (context: SinkErrorContext) => void
): void => {
  runPhase(enrichers.request, request, contextStore, request, onError)
}

export const applyResponseEnrichers = (
  enrichers: ResolvedEnrichers,
  contextStore: RequestContextStore,
  input: EnricherResponseInput,
  onError?: (context: SinkErrorContext) => void
): void => {
  runPhase(enrichers.response, input, contextStore, input.request, onError)
}
