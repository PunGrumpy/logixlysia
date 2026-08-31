import { createOtlpCore } from './adapters/otlp-core'
import {
  type AdapterTransport,
  type BatchTransportOptions,
  envString,
  stripTrailingSlashes,
  transportError
} from './adapters/shared'

const DEFAULT_ENDPOINT = 'https://in-otel.hyperdx.io'

export interface HyperDXTransportOptions extends BatchTransportOptions {
  /**
   * HyperDX ingestion API key, sent as the `authorization` header.
   * Falls back to the `HYPERDX_API_KEY` environment variable.
   */
  apiKey?: string
  /**
   * OTLP HTTP base URL — the adapter appends `/v1/logs`. For self-hosted
   * collectors pass the base URL only (port 4318 by default).
   * Falls back to `HYPERDX_OTLP_ENDPOINT`.
   * @default 'https://in-otel.hyperdx.io'
   */
  endpoint?: string
  /** Extra OTLP resource attributes merged next to `service.name`. */
  resourceAttributes?: Record<string, string>
  /**
   * Value of the `service.name` resource attribute.
   * Falls back to `HYPERDX_SERVICE_NAME`, then `OTEL_SERVICE_NAME`.
   * @default 'logixlysia'
   */
  serviceName?: string
}

/**
 * Creates a transport that ships logs to HyperDX as OTLP JSON
 * (`ExportLogsServiceRequest`) over HTTP. Meta fields become dot-notation log
 * attributes (`request.method`, `context.requestId`, …) so they are searchable
 * in the HyperDX UI.
 *
 * @throws When no API key is configured.
 */
export const createHyperDXTransport = (
  options: HyperDXTransportOptions = {}
): AdapterTransport => {
  const apiKey = options.apiKey ?? envString('HYPERDX_API_KEY')
  if (!apiKey) {
    throw transportError(
      'HyperDX',
      'missing API key. Set HYPERDX_API_KEY or pass apiKey to createHyperDXTransport()'
    )
  }

  const endpoint = stripTrailingSlashes(
    options.endpoint ?? envString('HYPERDX_OTLP_ENDPOINT') ?? DEFAULT_ENDPOINT
  )

  return createOtlpCore({
    headers: { authorization: apiKey },
    name: 'HyperDX',
    options,
    resourceAttributes: options.resourceAttributes ?? {},
    serviceName:
      options.serviceName ??
      envString('HYPERDX_SERVICE_NAME') ??
      envString('OTEL_SERVICE_NAME') ??
      'logixlysia',
    url: `${endpoint}/v1/logs`
  })
}

export type { AdapterTransport } from './adapters/shared'
