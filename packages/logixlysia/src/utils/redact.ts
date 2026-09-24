// Local part ≤64, domain ≤253, TLD 2–63 (RFC 5321 / 1035-ish limits; bounded to avoid ReDoS)
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/gu
const IPV4_REGEX =
  /(?<![\w/.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w.])/gu
/**
 * Bounded IPv6: either all 8 groups, or a single `::` compression. Requiring
 * one of those shapes (rather than "2+ colon-separated hex groups") keeps
 * clock times (`12:30:45`) and MAC addresses (`aa:bb:cc:dd:ee:ff`) from
 * matching.
 */
const IPV6_REGEX =
  /(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}))(?![\w:])/gu
/** Digit runs that may be formatted PANs (spaces/dashes); validated with Luhn before redacting. */
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]*?){13,19}\b/gu
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gu

const PAN_MIN_LEN = 13
const PAN_MAX_LEN = 19

const REDACTED_TEXT = '[REDACTED]'
const CIRCULAR_REF = '[Circular]'

/** Case-insensitive key/header names whose VALUES are always redacted. */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'password',
  'passwd',
  'secret',
  'client-secret',
  'token',
  'access-token',
  'refresh-token',
  'id-token',
  'session',
  'session-id',
  'private-key',
  'credit-card',
  'card-number',
  'cvv',
  'ssn'
]

const CAMEL_CASE_BOUNDARY_REGEX = /(?<before>[a-z0-9])(?<after>[A-Z])/gu

/** Normalize `X_Api-Key` / `apiKey` style variants to `x-api-key` form. */
const normalizeKeyName = (key: string): string =>
  key
    .replace(CAMEL_CASE_BOUNDARY_REGEX, '$<before>-$<after>')
    .replaceAll('_', '-')
    .toLowerCase()

export const isSensitiveKey = (
  key: string,
  extraKeys?: readonly string[]
): boolean => {
  const normalized = normalizeKeyName(key)
  if (DEFAULT_REDACT_KEYS.includes(normalized)) {
    return true
  }
  return (
    extraKeys?.some(extraKey => normalizeKeyName(extraKey) === normalized) ??
    false
  )
}

/** pino redact paths for one key: top-level and one nesting level. */
export const buildPinoRedactPaths = (
  extraKeys?: readonly string[]
): string[] => {
  const keys = [...DEFAULT_REDACT_KEYS, ...(extraKeys ?? [])]
  return keys.flatMap(key => {
    // pino paths don't allow `-` in bare identifiers; bracket-quote them.
    if (key.includes('-')) {
      return [`["${key}"]`, `*["${key}"]`]
    }
    return [key, `*.${key}`]
  })
}

/** Luhn checksum; `digits` must contain only `0-9` and length in PAN range. */
const passesLuhn = (digits: string): boolean => {
  if (digits.length < PAN_MIN_LEN || digits.length > PAN_MAX_LEN) {
    return false
  }

  let sum = 0
  let alternate = false

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const code = digits.codePointAt(i) ?? 0
    if (code < 48 || code > 57) {
      return false
    }
    let n = code - 48
    if (alternate) {
      n *= 2
      if (n > 9) {
        n -= 9
      }
    }
    sum += n
    alternate = !alternate
  }

  return sum % 10 === 0
}

const redactCreditCardCandidates = (text: string): string =>
  text.replace(CREDIT_CARD_CANDIDATE_REGEX, match => {
    const digits = match.replaceAll(/\D/gu, '')
    if (
      digits.length >= PAN_MIN_LEN &&
      digits.length <= PAN_MAX_LEN &&
      passesLuhn(digits)
    ) {
      return REDACTED_TEXT
    }
    return match
  })

/** Returns `text` unchanged (same value) when nothing matched — callers can compare `=== input`. */
export const redactString = (text: string): string => {
  let result = text

  result = result.replace(EMAIL_REGEX, REDACTED_TEXT)
  result = result.replace(IPV4_REGEX, REDACTED_TEXT)
  result = result.replace(IPV6_REGEX, REDACTED_TEXT)
  result = redactCreditCardCandidates(result)
  result = result.replace(JWT_REGEX, REDACTED_TEXT)

  return result
}

/**
 * Host and userinfo cannot contain `[REDACTED]` — `[` begins an IPv6 literal in URLs and breaks parsing.
 */
const URL_SAFE_REDACT = 'redacted'

const redactUrlAuthoritySegment = (value: string): string =>
  redactString(value).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)

/** Apply PII redaction to a request URL while keeping the result parseable by the URL/Request constructors. */
const redactRequestUrl = (
  urlString: string,
  extraKeys?: readonly string[]
): string => {
  try {
    const u = new URL(urlString)
    if (u.username !== '') {
      u.username = redactUrlAuthoritySegment(u.username)
    }
    if (u.password !== '') {
      u.password = redactUrlAuthoritySegment(u.password)
    }
    u.hostname = redactUrlAuthoritySegment(u.hostname)
    u.pathname = redactString(u.pathname)
    // `searchParams.set` re-serializes the whole query string, so redact
    // decoded values directly rather than re-running pattern redaction on
    // `u.search` afterward (which would see already percent-encoded text).
    // Iterate a copy: `set` below rewrites the live list.
    for (const key of new URLSearchParams(u.searchParams).keys()) {
      if (isSensitiveKey(key, extraKeys)) {
        u.searchParams.set(key, URL_SAFE_REDACT)
        continue
      }
      const value = u.searchParams.get(key)
      if (value !== null) {
        const redactedValue = redactString(value)
        if (redactedValue !== value) {
          u.searchParams.set(key, redactedValue)
        }
      }
    }
    u.hash = redactString(u.hash)
    return u.toString()
  } catch {
    return redactString(urlString).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)
  }
}

const withReentrancyGuard = <T>(
  obj: object,
  inProgress: WeakSet<object>,
  run: () => T
): T => {
  inProgress.add(obj)
  try {
    return run()
  } finally {
    inProgress.delete(obj)
  }
}

/**
 * Mutually recursive. One object lets each walker reach the others by
 * property instead of by a binding declared later in the file.
 */
const walker = {
  /**
   * Redacts each item; returns the ORIGINAL array reference when no item changed (zero
   * allocations for the common no-PII case). A new array is materialized lazily, starting from
   * the first item that changes — items before that point are known-unchanged, so they're copied
   * from `value` as-is rather than recomputed.
   */
  array: (
    value: unknown[],
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): unknown[] => {
    let result: unknown[] | undefined

    for (const [index, original] of value.entries()) {
      const redacted = walker.value(original, inProgress, extraKeys)
      if (result === undefined && redacted !== original) {
        result = value.slice(0, index)
      }
      result?.push(redacted)
    }

    return result ?? value
  },

  // Errors are exempt from the identity fast path: a redacted Error is always constructed
  // fresh (even when nothing changed) so consumers never receive the original, potentially
  // stack-trace-carrying instance by reference.
  error: (
    originalError: Error,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): Error & Record<string, unknown> => {
    const redactedMessage = redactString(originalError.message)
    const proto = Object.getPrototypeOf(originalError) as object
    const newError = Object.create(proto) as Error & Record<string, unknown>

    newError.message = redactedMessage
    newError.name = originalError.name

    if (originalError.stack !== undefined) {
      newError.stack = redactString(originalError.stack)
    }

    const errorRecord = originalError as unknown as Record<string, unknown>

    for (const key of Object.getOwnPropertyNames(errorRecord)) {
      if (key === 'message' || key === 'name' || key === 'stack') {
        continue
      }

      const descriptor = Object.getOwnPropertyDescriptor(errorRecord, key)
      if (descriptor === undefined) {
        continue
      }

      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        Object.defineProperty(newError, key, descriptor)
        continue
      }

      const redactedValue = isSensitiveKey(key, extraKeys)
        ? REDACTED_TEXT
        : walker.value(descriptor.value, inProgress, extraKeys)

      Object.defineProperty(newError, key, {
        ...descriptor,
        value: redactedValue
      })
    }

    return newError
  },

  /** Same lazy-materialization strategy as {@link walker.array}, for plain objects. */
  record: (
    recordValue: Record<string, unknown>,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): Record<string, unknown> => {
    const keys = Object.keys(recordValue)
    let result: Record<string, unknown> | undefined

    for (const [index, key] of keys.entries()) {
      const original = recordValue[key]
      const sensitive = isSensitiveKey(key, extraKeys)
      const redacted = sensitive
        ? REDACTED_TEXT
        : walker.value(original, inProgress, extraKeys)

      if (result === undefined && (sensitive || redacted !== original)) {
        result = {}
        for (const priorKey of keys.slice(0, index)) {
          result[priorKey] = recordValue[priorKey]
        }
      }
      if (result !== undefined) {
        result[key] = redacted
      }
    }

    return result ?? recordValue
  },

  value: <T>(
    value: T,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): T => {
    if (value === null || value === undefined) {
      return value
    }

    if (typeof value === 'string') {
      return redactString(value) as unknown as T
    }

    const type = typeof value
    if (type !== 'object') {
      return value
    }

    if (value instanceof Date) {
      // Dates carry no redactable string content and are never mutated by this module, so they
      // pass through by reference (part of the identity fast path) instead of being defensively
      // cloned as before.
      return value
    }

    const obj = value as object
    if (inProgress.has(obj)) {
      return CIRCULAR_REF as unknown as T
    }

    if (value instanceof Error) {
      return withReentrancyGuard(obj, inProgress, () =>
        walker.error(value, inProgress, extraKeys)
      ) as unknown as T
    }

    if (Array.isArray(value)) {
      return withReentrancyGuard(obj, inProgress, () =>
        walker.array(value, inProgress, extraKeys)
      ) as unknown as T
    }

    return withReentrancyGuard(obj, inProgress, () =>
      walker.record(value as Record<string, unknown>, inProgress, extraKeys)
    ) as unknown as T
  }
}

export const redact = <T>(value: T, extraKeys?: readonly string[]): T =>
  walker.value(value, new WeakSet(), extraKeys)

/**
 * Clone request URL, method and headers for logging with the same string redaction as {@link redact}.
 * The returned request is a logging-only artifact carrying url/method/headers/signal; it intentionally
 * omits the body so it never re-uses the original (possibly already-consumed) request stream. The
 * original request is left untouched and remains usable.
 */
export const redactRequest = (
  request: Request,
  extraKeys?: readonly string[]
): Request => {
  const redactedUrl = redactRequestUrl(request.url, extraKeys)
  const nextHeaders = new Headers()
  let headersChanged = false

  for (const [name, value] of request.headers.entries()) {
    const redacted = isSensitiveKey(name, extraKeys)
      ? REDACTED_TEXT
      : redactString(value)
    if (redacted !== value) {
      headersChanged = true
    }
    nextHeaders.set(name, redacted)
  }

  const redactedMethod = redactString(request.method)
  const urlChanged = redactedUrl !== request.url
  const methodChanged = redactedMethod !== request.method

  if (!(urlChanged || headersChanged || methodChanged)) {
    return request
  }

  const init: RequestInit = {
    headers: nextHeaders,
    method: redactedMethod,
    redirect: request.redirect,
    signal: request.signal
  }

  return new Request(redactedUrl, init)
}
