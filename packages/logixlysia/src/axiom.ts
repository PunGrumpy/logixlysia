import {
  createHttpTransport,
  envString,
  isPlainObject,
  stripTrailingSlashes,
  transportError,
  tryParseUrl
} from './adapters/shared'
import type {
  AdapterTransport,
  BatchTransportOptions,
  RejectedEntries
} from './adapters/shared'
import { stringifyForLog } from './utils/json'

const DEFAULT_BASE_URL = 'https://api.axiom.co'
const EDGE_INGEST_PATH = '/v1/ingest'

const EDGE_DOMAIN = /^[a-z0-9][a-z0-9.-]*(?::\d+)?$/iu

const isPassed = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null

const edgeIngestUrl = (edgeUrl: string, dataset: string): string => {
  const parsed = tryParseUrl(edgeUrl)
  if (!parsed || parsed.username || parsed.password) {
    throw transportError(
      'Axiom',
      "edgeUrl (AXIOM_EDGE_URL) must be a full URL without credentials, such as 'https://eu-central-1.aws.edge.axiom.co'"
    )
  }
  const path = stripTrailingSlashes(parsed.pathname)
  parsed.pathname = path || `${EDGE_INGEST_PATH}/${encodeURIComponent(dataset)}`
  return parsed.toString()
}

const edgeDomainUrl = (edge: string, dataset: string): string => {
  const url = `https://${edge}${EDGE_INGEST_PATH}/${encodeURIComponent(dataset)}`
  if (!(EDGE_DOMAIN.test(edge) && tryParseUrl(url))) {
    throw transportError(
      'Axiom',
      "edge (AXIOM_EDGE) must be a domain without a scheme or a path, such as 'eu-central-1.aws.edge.axiom.co'. Pass a full URL as edgeUrl"
    )
  }
  return url
}

const ingestUrl = (options: AxiomTransportOptions, dataset: string): string => {
  const useEnv =
    !isPassed(options.edgeUrl) &&
    !isPassed(options.edge) &&
    !isPassed(options.baseUrl)
  const edgeUrl = useEnv ? envString('AXIOM_EDGE_URL') : options.edgeUrl
  if (isPassed(edgeUrl)) {
    return edgeIngestUrl(edgeUrl, dataset)
  }
  const edge = useEnv ? envString('AXIOM_EDGE') : options.edge
  if (isPassed(edge)) {
    return edgeDomainUrl(edge, dataset)
  }
  const baseUrl = stripTrailingSlashes(
    (useEnv ? envString('AXIOM_URL') : options.baseUrl) ?? DEFAULT_BASE_URL
  )
  return `${baseUrl}/v1/datasets/${encodeURIComponent(dataset)}/ingest`
}

const failedEvents = (response: unknown): RejectedEntries | undefined => {
  if (!isPlainObject(response)) {
    return
  }
  const { failed, failures } = response
  if (typeof failed !== 'number') {
    return
  }
  const [first] = Array.isArray(failures) ? failures : []
  const error = isPlainObject(first) ? first.error : undefined
  return {
    count: failed,
    detail: typeof error === 'string' ? error : undefined
  }
}

export interface AxiomTransportOptions extends BatchTransportOptions {
  /**
   * Axiom API token with ingest permission (`xaat-…`).
   * Falls back to the `AXIOM_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * Base URL of the legacy ingest endpoint, `/v1/datasets/{dataset}/ingest`.
   * Not used when `edge` or `edgeUrl` is set. Read from `AXIOM_URL` when none
   * of the three is passed.
   * @default 'https://api.axiom.co'
   */
  baseUrl?: string
  /**
   * Target dataset name.
   * Falls back to `AXIOM_DATASET`.
   */
  dataset?: string
  /**
   * Edge domain to ingest through, without a scheme or a path, such as
   * `eu-central-1.aws.edge.axiom.co`; a port is allowed. Posts to
   * `/v1/ingest/{dataset}` on it. Read from `AXIOM_EDGE` when none of
   * `edgeUrl`, `edge` and `baseUrl` is passed.
   */
  edge?: string
  /**
   * Full URL of an edge endpoint, or of a proxy in front of one, without a
   * user name or a password. Wins over `edge`. Trailing slashes are removed
   * from its path; if nothing is left, the path becomes
   * `/v1/ingest/{dataset}`. Read from `AXIOM_EDGE_URL` when none of
   * `edgeUrl`, `edge` and `baseUrl` is passed.
   */
  edgeUrl?: string
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
 * @throws {Error} When no API token or dataset is configured.
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
      stringifyForLog(
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
    rejected: failedEvents,
    url: ingestUrl(options, dataset)
  })
}

export type { AdapterTransport } from './adapters/shared'
