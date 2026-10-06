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
/**
 * `://user:password@` in free text (the user part may be empty, as in a Redis
 * URL); a password is a secret whatever it looks like. The scheme in front is
 * checked by `endsWithUrlScheme` instead of matched here: a pattern that
 * starts with `[a-z][a-z0-9+.-]*` retries from every letter of a long word,
 * which is quadratic in the word's length.
 */
const URL_PASSWORD_REGEX = /(?<prefix>:\/\/[^\s/?#@:]*:)[^\s/?#@]+@/gu
const URL_SCHEME_LETTER_REGEX = /[a-z]/iu
const URL_SCHEME_MARK_REGEX = /[\d+.-]/u
/**
 * An HTTP credential after its scheme word. Only a token with a digit, a
 * URL-safe punctuation mark or an uppercase letter after a word character is
 * masked, so prose such as "Basic authentication failed" is left alone.
 */
const HTTP_CREDENTIAL_REGEX =
  /\b(?<scheme>[Bb]earer|[Bb]asic)\s+(?<token>[\w\-.~+/]{8,}=*)/gu
const CREDENTIAL_MARK_REGEX = /[\d\-.~+/]/u
/** No `i` flag, under which `[A-Z]` would match every lowercase letter too. */
const INNER_CAPITAL_REGEX = /\w[A-Z]/u

const PAN_MIN_LEN = 13
const PAN_MAX_LEN = 19

const REDACTED_TEXT = '[REDACTED]'
const CIRCULAR_REF = '[Circular]'
const UNSERIALIZABLE_TEXT = '[Unserializable]'

/** Case-insensitive key/header names whose VALUES are always redacted. */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'cookies',
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

/** Words that make a key sensitive wherever they appear as a whole part. */
const SENSITIVE_KEY_PARTS: ReadonlySet<string> = new Set([
  'passwd',
  'password',
  'secret'
])
/** A key ending in this part names a credential (`auth-token`, `x-csrf-token`). */
const SENSITIVE_LAST_KEY_PART = 'token'

/**
 * True for a default or extra key name, or for any key with a whole part
 * `password`, `passwd` or `secret`, or ending in the part `token`. Parts are
 * split on case changes, `_` and `-`, so `tokenizer` and `maxTokens` stay
 * unmatched while `newPassword` and `X-CSRF-Token` match.
 */
export const isSensitiveKey = (
  key: string,
  extraKeys?: readonly string[]
): boolean => {
  const normalized = normalizeKeyName(key)
  if (DEFAULT_REDACT_KEYS.includes(normalized)) {
    return true
  }
  if (extraKeys?.some(extraKey => normalizeKeyName(extraKey) === normalized)) {
    return true
  }
  const parts = normalized.split('-')
  return (
    parts.some(part => SENSITIVE_KEY_PARTS.has(part)) ||
    parts.at(-1) === SENSITIVE_LAST_KEY_PART
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

/** True when `text` has a URL scheme (a letter, then letters, digits, `+`, `.` or `-`) ending at `end`. */
const endsWithUrlScheme = (text: string, end: number): boolean => {
  for (let i = end - 1; i >= 0; i -= 1) {
    const char = text.charAt(i)
    if (URL_SCHEME_LETTER_REGEX.test(char)) {
      return true
    }
    if (!URL_SCHEME_MARK_REGEX.test(char)) {
      return false
    }
  }
  return false
}

/** Returns `text` unchanged (same value) when nothing matched — callers can compare `=== input`. */
export const redactString = (text: string): string => {
  let result = text

  // Before the email pass, which would otherwise eat `password@host.tld`.
  result = result.replace(
    URL_PASSWORD_REGEX,
    (match: string, prefix: string, offset: number, whole: string) =>
      endsWithUrlScheme(whole, offset) ? `${prefix}${REDACTED_TEXT}@` : match
  )
  result = result.replace(EMAIL_REGEX, REDACTED_TEXT)
  result = result.replace(IPV4_REGEX, REDACTED_TEXT)
  result = result.replace(IPV6_REGEX, REDACTED_TEXT)
  result = redactCreditCardCandidates(result)
  result = result.replace(JWT_REGEX, REDACTED_TEXT)
  result = result.replace(
    HTTP_CREDENTIAL_REGEX,
    (match: string, scheme: string, token: string) =>
      CREDENTIAL_MARK_REGEX.test(token) || INNER_CAPITAL_REGEX.test(token)
        ? `${scheme} ${REDACTED_TEXT}`
        : match
  )

  return result
}

/**
 * Host and userinfo cannot contain `[REDACTED]` — `[` begins an IPv6 literal in URLs and breaks parsing.
 */
const URL_SAFE_REDACT = 'redacted'

const redactUrlAuthoritySegment = (value: string): string =>
  redactString(value).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)

/** Always returns a new instance; `params` is left untouched. */
const redactSearchParams = (
  params: URLSearchParams,
  extraKeys?: readonly string[]
): URLSearchParams => {
  const result = new URLSearchParams()
  for (const [key, value] of params) {
    result.append(
      key,
      isSensitiveKey(key, extraKeys) ? URL_SAFE_REDACT : redactString(value)
    )
  }
  return result
}

/**
 * Redacts the decoded segment so `%40` cannot hide an email. Re-encodes only
 * when redaction changed the text; other segments keep their spelling.
 */
const redactPathSegment = (segment: string): string => {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // Malformed escape: redact the raw segment instead.
  }
  const redacted = redactString(decoded)
  if (decoded === segment) {
    return redacted
  }
  return redacted === decoded ? segment : encodeURIComponent(redacted)
}

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
      u.password = URL_SAFE_REDACT
    }
    u.hostname = redactUrlAuthoritySegment(u.hostname)
    u.pathname = u.pathname.split('/').map(redactPathSegment).join('/')
    // Assigning `search` re-serializes the query, so do it only when a value
    // changed. The values are decoded here, so patterns never run against
    // percent-encoded text.
    const query = redactSearchParams(u.searchParams, extraKeys).toString()
    if (query !== u.searchParams.toString()) {
      u.search = query
    }
    u.hash = redactString(u.hash)
    return u.toString()
  } catch {
    return redactString(urlString).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)
  }
}

/** Headers whose value is an absolute URL and may carry a sensitive query key. */
const URL_VALUED_HEADERS: ReadonlySet<string> = new Set([
  'content-location',
  'location',
  'referer'
])

/** The URL's own serialisation, so a masked copy can be told from a merely normalised one. */
const normalizedHref = (value: string): string => {
  try {
    return new URL(value).href
  } catch {
    return value
  }
}

/** One header value: whole when the name is sensitive, by URL rules for a URL-valued header, by pattern otherwise. */
const redactHeaderValue = (
  name: string,
  value: string,
  extraKeys?: readonly string[]
): string => {
  if (isSensitiveKey(name, extraKeys)) {
    return REDACTED_TEXT
  }
  if (!URL_VALUED_HEADERS.has(name.toLowerCase())) {
    return redactString(value)
  }
  const redacted = redactRequestUrl(value, extraKeys)
  // Keep the client's spelling when nothing was masked: serialising a URL
  // alone adds a trailing slash, and a changed header clones the request.
  return redacted === normalizedHref(value) ? value : redacted
}

/** Always returns a new instance; `headers` is left untouched. */
const redactHeaders = (
  headers: Headers,
  extraKeys?: readonly string[]
): Headers => {
  const result = new Headers()
  for (const [name, value] of headers) {
    result.append(name, redactHeaderValue(name, value, extraKeys))
  }
  return result
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

    // Defined, not assigned: `DOMException` and getter-only subclasses have
    // accessor `name`/`message` on the prototype, and assigning through
    // them throws in strict mode. Native errors keep all three non-enumerable.
    const defineOwn = (key: string, value: unknown): void => {
      Object.defineProperty(newError, key, {
        configurable: true,
        enumerable: false,
        value,
        writable: true
      })
    }
    defineOwn('message', redactedMessage)
    defineOwn('name', originalError.name)
    if (originalError.stack !== undefined) {
      defineOwn('stack', redactString(originalError.stack))
    }
    if (originalError instanceof DOMException) {
      // The copy has no DOMException internal slot, so the prototype's `code`
      // getter would throw on it; the console tree reads `.code` on errors.
      defineOwn('code', originalError.code)
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

  map: (
    value: Map<unknown, unknown>,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): Map<unknown, unknown> => {
    const result = new Map<unknown, unknown>()
    for (const [key, entry] of value) {
      const sensitive =
        typeof key === 'string' && isSensitiveKey(key, extraKeys)
      result.set(
        key,
        sensitive ? REDACTED_TEXT : walker.value(entry, inProgress, extraKeys)
      )
    }
    return result
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

  set: (
    value: Set<unknown>,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): Set<unknown> =>
    new Set(
      Array.from(value, item => walker.value(item, inProgress, extraKeys))
    ),

  /** What the sinks will serialize is the toJSON output, so that is what the key and pattern checks must see. */
  toJson: (
    value: { toJSON: () => unknown },
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): unknown => {
    let plain: unknown
    try {
      plain = value.toJSON()
    } catch {
      return UNSERIALIZABLE_TEXT
    }
    if (plain === value) {
      // A toJSON that returns its own object: the guard already holds it,
      // so walk its keys directly instead of answering "[Circular]".
      return walker.record(
        value as unknown as Record<string, unknown>,
        inProgress,
        extraKeys
      )
    }
    return walker.value(plain, inProgress, extraKeys)
  },

  value: (
    value: unknown,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): unknown => {
    if (typeof value === 'string') {
      return redactString(value)
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    if (value instanceof Date) {
      // Dates carry no redactable string content and are never mutated by this module, so they
      // pass through by reference (part of the identity fast path) instead of being defensively
      // cloned as before.
      return value
    }

    if (inProgress.has(value)) {
      return CIRCULAR_REF
    }

    // These types expose their contents only through iteration or toJSON(),
    // so the key walk below would return them unchanged.
    if (value instanceof Headers) {
      return redactHeaders(value, extraKeys)
    }

    if (value instanceof URLSearchParams) {
      return redactSearchParams(value, extraKeys)
    }

    if (value instanceof URL) {
      try {
        return new URL(redactRequestUrl(value.href, extraKeys))
      } catch {
        return REDACTED_TEXT
      }
    }

    if (value instanceof Map) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.map(value, inProgress, extraKeys)
      )
    }

    if (value instanceof Set) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.set(value, inProgress, extraKeys)
      )
    }

    if (value instanceof Error) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.error(value, inProgress, extraKeys)
      )
    }

    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
      // Bytes carry no keys to match; walking a buffer costs one key check per byte.
      return value
    }

    const { toJSON } = value as { toJSON?: unknown }
    if (typeof toJSON === 'function') {
      return withReentrancyGuard(value, inProgress, () =>
        walker.toJson(value as { toJSON: () => unknown }, inProgress, extraKeys)
      )
    }

    if (Array.isArray(value)) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.array(value, inProgress, extraKeys)
      )
    }

    return withReentrancyGuard(value, inProgress, () =>
      walker.record(value as Record<string, unknown>, inProgress, extraKeys)
    )
  }
}

/**
 * Apart from a circular reference, which becomes the marker string, the walk
 * keeps each value's shape: a string stays a string, an array an array, an
 * Error an Error. The exception is a non-error value with `toJSON`, which
 * becomes what it serializes to, since that is what the sinks write. For
 * everything else the input type still describes the output.
 */
export const redact = <T>(value: T, extraKeys?: readonly string[]): T =>
  walker.value(value, new WeakSet(), extraKeys) as T

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
    const redacted = redactHeaderValue(name, value, extraKeys)
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
