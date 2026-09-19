import type {
  Enricher,
  EnricherFields,
  EnricherResponseInput
} from './types/enricher'

export type {
  Enricher,
  EnricherFields,
  EnricherLike,
  EnricherResponseInput
} from './types/enricher'

const HEX_RADIX = 16
const MAX_TRACESTATE_LENGTH = 512

// version-trace_id-parent_id-flags, with an optional tail for versions > 00.
const TRACEPARENT =
  /^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})(?:-.+)?$/
const ZERO_TRACE_ID = '0'.repeat(32)
const ZERO_SPAN_ID = '0'.repeat(16)
const INVALID_VERSION = 'ff'
const CURRENT_VERSION = '00'
/** `00-` + 32 + `-` + 16 + `-` + 2: version 00 is exactly these four fields. */
const VERSION_00_LENGTH = 55

export interface TraceparentEnricherOptions {
  /**
   * Header to read the trace context from.
   * @default 'traceparent'
   */
  header?: string
  /**
   * Also record the raw `tracestate` header (truncated to 512 characters).
   * @default false
   */
  tracestate?: boolean
}

/**
 * Reads W3C trace context straight off the request headers, so logs link to
 * traces in Sentry, HyperDX, or any OTLP backend without an OpenTelemetry SDK
 * in the process.
 *
 * Use `logixlysia/otel` instead when you already run the SDK and want the ids
 * of the *active span* rather than the ids the caller propagated.
 *
 * Adds `trace_id`, `span_id`, `trace_flags`, and `trace_sampled`.
 */
export const traceparentEnricher = (
  options: TraceparentEnricherOptions = {}
): Enricher => {
  const header = options.header ?? 'traceparent'

  return {
    request(request) {
      const raw = request.headers.get(header)
      if (!raw) {
        return
      }

      const value = raw.trim()
      const match = TRACEPARENT.exec(value)
      if (!match) {
        return
      }

      const [, version, traceId, spanId, flags] = match

      // `ff` is reserved, all-zero ids are invalid, and a version-00 header
      // carrying extra fields is malformed rather than forward-compatible.
      if (
        version === INVALID_VERSION ||
        traceId === ZERO_TRACE_ID ||
        spanId === ZERO_SPAN_ID ||
        (version === CURRENT_VERSION && value.length !== VERSION_00_LENGTH)
      ) {
        return
      }

      const fields: Record<string, unknown> = {
        span_id: spanId,
        trace_flags: flags,
        trace_id: traceId,
        // `sampled` is the low bit of the flags byte, so an odd value is set.
        trace_sampled: Number.parseInt(flags, HEX_RADIX) % 2 === 1
      }

      if (options.tracestate) {
        const state = request.headers.get('tracestate')
        if (state) {
          fields.tracestate = state.slice(0, MAX_TRACESTATE_LENGTH)
        }
      }

      return fields
    }
  }
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless/i
const TABLET = /ipad|tablet|playbook|silk|kindle/i
const MOBILE = /mobi|iphone|ipod|windows phone/i
const ANDROID_MOBILE = /android.*mobile/i

/** First match wins, so more specific engines are listed before their base. */
const BROWSERS: readonly [name: string, pattern: RegExp][] = [
  ['Edge', /edg(?:a|ios)?\/([\d.]+)/i],
  ['Opera', /(?:opr|opios|opera)\/([\d.]+)/i],
  ['Samsung Internet', /samsungbrowser\/([\d.]+)/i],
  ['Firefox', /(?:firefox|fxios)\/([\d.]+)/i],
  ['Chrome', /(?:chrome|crios)\/([\d.]+)/i],
  ['Safari', /version\/([\d.]+).*safari/i]
]

const OPERATING_SYSTEMS: readonly [name: string, pattern: RegExp][] = [
  ['iOS', /iphone|ipad|ipod/i],
  ['Android', /android/i],
  ['ChromeOS', /cros/i],
  ['Windows', /windows nt/i],
  ['macOS', /mac os x/i],
  ['Linux', /linux/i]
]

const matchName = (
  candidates: readonly [string, RegExp][],
  value: string
): { name: string; version?: string } | undefined => {
  for (const [name, pattern] of candidates) {
    const match = pattern.exec(value)
    if (match) {
      return { name, version: match[1] }
    }
  }
}

const resolveDevice = (value: string, bot: boolean): string => {
  if (bot) {
    return 'bot'
  }
  if (TABLET.test(value)) {
    return 'tablet'
  }
  if (MOBILE.test(value) || ANDROID_MOBILE.test(value)) {
    return 'mobile'
  }
  return 'desktop'
}

/**
 * Turns the `user-agent` header into queryable fields under `ua`: `browser`,
 * `browserVersion`, `os`, `device` (`desktop` | `mobile` | `tablet` | `bot`),
 * and `bot`.
 *
 * Deliberately a heuristic — user agents are not a parseable grammar. It is
 * built for grouping traffic in a dashboard, not for making access decisions.
 */
export const userAgentEnricher = (): Enricher => ({
  request(request) {
    const value = request.headers.get('user-agent')
    if (!value) {
      return
    }

    const bot = BOT.test(value)
    const browser = matchName(BROWSERS, value)
    const os = matchName(OPERATING_SYSTEMS, value)

    return {
      ua: {
        bot,
        ...(browser ? { browser: browser.name } : {}),
        ...(browser?.version ? { browserVersion: browser.version } : {}),
        device: resolveDevice(value, bot),
        ...(os ? { os: os.name } : {})
      }
    }
  }
})

/** Header candidates per geo field, in priority order across platforms. */
const GEO_HEADERS: readonly [field: string, headers: readonly string[]][] = [
  ['city', ['x-vercel-ip-city', 'cf-ipcity']],
  ['country', ['x-vercel-ip-country', 'cf-ipcountry']],
  ['region', ['x-vercel-ip-country-region', 'cf-region-code', 'cf-region']],
  ['timezone', ['x-vercel-ip-timezone', 'cf-timezone']]
]

const GEO_NUMERIC_HEADERS: readonly [
  field: string,
  headers: readonly string[],
  range: readonly [number, number]
][] = [
  ['latitude', ['x-vercel-ip-latitude', 'cf-iplatitude'], [-90, 90]],
  ['longitude', ['x-vercel-ip-longitude', 'cf-iplongitude'], [-180, 180]]
]

const NETLIFY_GEO_HEADER = 'x-nf-geo'
const GEO_STRING_MAX = 128
const GEO_RAW_HEADER_MAX = 2048
/** ISO-3166-ish country/region codes: short alphanumeric tokens, never free text. */
const GEO_CODE_REGEX = /^[A-Za-z0-9-]{1,10}$/

const firstHeader = (
  request: Request,
  headers: readonly string[]
): string | undefined => {
  for (const header of headers) {
    const value = request.headers.get(header)
    if (value) {
      return value
    }
  }
}

/** Vercel percent-encodes city names, so `S%C3%A3o%20Paulo` must be decoded. */
const decodeHeaderValue = (value: string): string => {
  try {
    return decodeURIComponent(value).slice(0, GEO_STRING_MAX)
  } catch {
    return value.slice(0, GEO_STRING_MAX)
  }
}

const isInRange = (value: number, min: number, max: number): boolean =>
  value >= min && value <= max

interface NetlifyGeo {
  city?: string
  country?: { code?: string }
  latitude?: number
  longitude?: number
  subdivision?: { code?: string }
  timezone?: string
}

const readNetlifyGeo = (
  request: Request
): Record<string, unknown> | undefined => {
  const raw = request.headers.get(NETLIFY_GEO_HEADER)
  if (!raw || raw.length > GEO_RAW_HEADER_MAX) {
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(atob(raw))
  } catch {
    return
  }

  if (parsed === null || typeof parsed !== 'object') {
    return
  }

  const data = parsed as NetlifyGeo
  const geo: Record<string, unknown> = {}
  if (data.city) {
    geo.city = data.city.slice(0, GEO_STRING_MAX)
  }
  if (data.country?.code && GEO_CODE_REGEX.test(data.country.code)) {
    geo.country = data.country.code
  }
  if (data.subdivision?.code && GEO_CODE_REGEX.test(data.subdivision.code)) {
    geo.region = data.subdivision.code
  }
  if (data.timezone) {
    geo.timezone = data.timezone.slice(0, GEO_STRING_MAX)
  }
  if (typeof data.latitude === 'number' && isInRange(data.latitude, -90, 90)) {
    geo.latitude = data.latitude
  }
  if (
    typeof data.longitude === 'number' &&
    isInRange(data.longitude, -180, 180)
  ) {
    geo.longitude = data.longitude
  }

  return Object.keys(geo).length > 0 ? geo : undefined
}

/** Fields whose value must look like a short country/region code, not free text. */
const GEO_CODE_FIELDS = new Set(['country', 'region'])

const readGeoStringFields = (
  request: Request,
  geo: Record<string, unknown>
): void => {
  for (const [field, headers] of GEO_HEADERS) {
    const value = firstHeader(request, headers)
    if (!value) {
      continue
    }
    const decoded = decodeHeaderValue(value)
    if (!GEO_CODE_FIELDS.has(field) || GEO_CODE_REGEX.test(decoded)) {
      geo[field] = decoded
    }
  }
}

const readGeoNumericFields = (
  request: Request,
  geo: Record<string, unknown>
): void => {
  for (const [field, headers, [min, max]] of GEO_NUMERIC_HEADERS) {
    const value = firstHeader(request, headers)
    const parsed = value === undefined ? Number.NaN : Number(value)
    if (Number.isFinite(parsed) && isInRange(parsed, min, max)) {
      geo[field] = parsed
    }
  }
}

/**
 * Reads the geo headers the edge already attached — Vercel, Cloudflare, or
 * Netlify — into `geo.city`, `geo.country`, `geo.region`, `geo.timezone`,
 * `geo.latitude`, and `geo.longitude`.
 *
 * Nothing is derived from the IP address itself, so behind a platform that
 * does not set these headers the enricher simply adds nothing.
 *
 * These headers are client-settable unless an edge in front of the app
 * overwrites them on every request — trust the values only behind such an
 * edge.
 */
export const geoEnricher = (): Enricher => ({
  request(request) {
    const geo: Record<string, unknown> = {}

    readGeoStringFields(request, geo)
    readGeoNumericFields(request, geo)

    if (Object.keys(geo).length > 0) {
      return { geo }
    }

    const netlify = readNetlifyGeo(request)
    return netlify ? { geo: netlify } : undefined
  }
})

const readContentLength = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  if (typeof value !== 'string' || value.length === 0) {
    return
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

const findHeader = (
  headers: Record<string, unknown>,
  name: string
): unknown => {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) {
      return value
    }
  }
}

/**
 * Records payload sizes as `requestBytes` and `responseBytes`.
 *
 * Both come from `content-length`, which is the only size the plugin can read
 * without buffering a body. A chunked or streamed response has no
 * `content-length`, so `responseBytes` is omitted rather than guessed.
 */
export const sizeEnricher = (): Enricher => ({
  request(request): EnricherFields {
    const bytes = readContentLength(request.headers.get('content-length'))
    return bytes === undefined ? undefined : { requestBytes: bytes }
  },
  response(input: EnricherResponseInput): EnricherFields {
    const bytes = readContentLength(findHeader(input.headers, 'content-length'))
    return bytes === undefined ? undefined : { responseBytes: bytes }
  }
})
