import {
  type AdapterTransport,
  type BatchTransportOptions,
  createHttpTransport,
  envString,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const DEFAULT_BASE_URL = 'https://api.axiom.co'

export interface AxiomTransportOptions extends BatchTransportOptions {
  /**
   * Axiom API token with ingest permission (`xaat-…`).
   * Falls back to the `AXIOM_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * API base URL.
   * Falls back to `AXIOM_URL`.
   * @default 'https://api.axiom.co'
   */
  baseUrl?: string
  /**
   * Target dataset name.
   * Falls back to `AXIOM_DATASET`.
   */
  dataset?: string
  /**
   * Organization ID — required when using a personal access token.
   * Falls back to `AXIOM_ORG_ID`.
   */
  orgId?: string
}

/**
 * Creates a transport that ships logs to an Axiom dataset via the ingest API.
 * Events keep their nested structure — Axiom indexes every field without a
 * schema, so `request.method`, `context.requestId`, etc. are all queryable.
 *
 * @throws When no API token or dataset is configured.
 */
export const createAxiomTransport = (
  options: AxiomTransportOptions = {}
): AdapterTransport => {
  const apiKey = options.apiKey ?? envString('AXIOM_API_KEY')
  if (!apiKey) {
    throw transportError(
      'Axiom',
      'missing API token. Set AXIOM_API_KEY or pass apiKey to createAxiomTransport()'
    )
  }
  const dataset = options.dataset ?? envString('AXIOM_DATASET')
  if (!dataset) {
    throw transportError(
      'Axiom',
      'missing dataset. Set AXIOM_DATASET or pass dataset to createAxiomTransport()'
    )
  }
  const baseUrl = stripTrailingSlashes(
    options.baseUrl ?? envString('AXIOM_URL') ?? DEFAULT_BASE_URL
  )
  const orgId = options.orgId ?? envString('AXIOM_ORG_ID')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }
  if (orgId) {
    headers['X-Axiom-Org-Id'] = orgId
  }

  return createHttpTransport({
    body: entries =>
      JSON.stringify(
        // Meta first so the adapter-owned fields below always win on collision.
        entries.map(entry => ({
          ...entry.meta,
          _time: entry.timestamp.toISOString(),
          level: entry.level,
          message: entry.message
        }))
      ),
    headers,
    name: 'Axiom',
    options,
    url: `${baseUrl}/v1/datasets/${encodeURIComponent(dataset)}/ingest`
  })
}

export type { AdapterTransport } from './adapters/shared'
