// Local part ≤64, domain ≤253, TLD 2–63 (RFC 5321 / 1035-ish limits; bounded to avoid ReDoS)
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/gu
const IPV4_REGEX =
  /(?<![\w/.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w.])/gu
const IPV6_REGEX =
  /(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}))(?![\w:])/gu
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]*?){13,19}\b/gu
/**
 * Starts only where a token can start: after a character outside the token
 * alphabet. Otherwise every `eyJ` inside a long run is a start position whose
 * scan runs to the end of the run, which is quadratic in the run's length.
 */
const JWT_REGEX = /(?<![\w-])eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/gu
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
const HTTP_CREDENTIAL_REGEX =
  /\b(?<scheme>[Bb]earer|[Bb]asic)\s+(?<token>[\w\-.~+/]{8,}=*)/gu
const CREDENTIAL_MARK_REGEX = /[\d\-.~+/]/u
/** No `i` flag, under which `[A-Z]` would match every lowercase letter too. */
const INNER_CAPITAL_REGEX = /\w[A-Z]/u
const looksLikeCredential = (token: string): boolean =>
  CREDENTIAL_MARK_REGEX.test(token) || INNER_CAPITAL_REGEX.test(token)

const PAN_MIN_LEN = 13
const PAN_MAX_LEN = 19

const REDACTED_TEXT = '[REDACTED]'
const CIRCULAR_REF = '[Circular]'
const UNSERIALIZABLE_TEXT = '[Unserializable]'

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

const normalizeKeyName = (key: string): string =>
  key
    .replace(CAMEL_CASE_BOUNDARY_REGEX, '$<before>-$<after>')
    .replaceAll('_', '-')
    .toLowerCase()

const SENSITIVE_KEY_PARTS: ReadonlySet<string> = new Set([
  'passwd',
  'password',
  'secret'
])
const SENSITIVE_LAST_KEY_PART = 'token'

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

/** pino redact paths for every default and extra key: top-level and one nesting level. */
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
      looksLikeCredential(token) ? `${scheme} ${REDACTED_TEXT}` : match
  )

  return result
}

/**
 * The host cannot hold `[REDACTED]`: `[` opens an IPv6 literal. Userinfo would
 * percent-encode it, so one bracket-free token serves both.
 */
const URL_SAFE_REDACT = 'redacted'

const redactUrlAuthoritySegment = (value: string): string =>
  redactString(value).replaceAll(REDACTED_TEXT, URL_SAFE_REDACT)

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

const decodeOrRaw = (segment: string): string => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const redactPathSegment = (segment: string): string => {
  const decoded = decodeOrRaw(segment)
  const redacted = redactString(decoded)
  if (decoded === segment) {
    return redacted
  }
  return redacted === decoded ? segment : encodeURIComponent(redacted)
}

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

const URL_VALUED_HEADERS: ReadonlySet<string> = new Set([
  'content-location',
  'location',
  'referer'
])

const normalizedHref = (value: string): string => {
  try {
    return new URL(value).href
  } catch {
    return value
  }
}

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

const MAX_DEPTH = 64
const DEPTH_TEXT = '[Depth]'
/** Containers open on the walk. `redact` is synchronous, so one counter serves nested calls too. */
let depth = 0

const withReentrancyGuard = <T>(
  obj: object,
  inProgress: WeakSet<object>,
  run: () => T
): T => {
  inProgress.add(obj)
  depth += 1
  try {
    return run()
  } finally {
    depth -= 1
    inProgress.delete(obj)
  }
}

const UNREADABLE = Symbol('unreadable')

const readToJson = (value: object): unknown => {
  try {
    const { toJSON } = value as { toJSON?: unknown }
    return toJSON
  } catch {
    return UNREADABLE
  }
}

const walker = {
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

      let current: unknown = descriptor.value
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        // Read once, on the original: the copy has no internal state for the
        // getter to read, and what it returns is what a sink would write.
        try {
          current = descriptor.get?.call(originalError)
        } catch {
          current = UNSERIALIZABLE_TEXT
        }
      }

      const redactedValue = isSensitiveKey(key, extraKeys)
        ? REDACTED_TEXT
        : walker.value(current, inProgress, extraKeys)

      Object.defineProperty(newError, key, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        value: redactedValue,
        writable: descriptor.writable ?? descriptor.set !== undefined
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

  record: (
    recordValue: Record<string, unknown>,
    inProgress: WeakSet<object>,
    extraKeys?: readonly string[]
  ): Record<string, unknown> | string => {
    let keys: string[]
    try {
      keys = Object.keys(recordValue)
    } catch {
      return UNSERIALIZABLE_TEXT
    }
    let result: Record<string, unknown> | undefined

    for (const [index, key] of keys.entries()) {
      let original: unknown
      let unreadable = false
      try {
        original = recordValue[key]
      } catch {
        unreadable = true
      }
      const sensitive = isSensitiveKey(key, extraKeys)
      let redacted: unknown = REDACTED_TEXT
      if (unreadable) {
        redacted = UNSERIALIZABLE_TEXT
      } else if (!sensitive) {
        redacted = walker.value(original, inProgress, extraKeys)
      }

      if (
        result === undefined &&
        (sensitive || unreadable || redacted !== original)
      ) {
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
      return value
    }

    if (inProgress.has(value)) {
      return CIRCULAR_REF
    }

    if (depth >= MAX_DEPTH) {
      return DEPTH_TEXT
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
      return value
    }

    const toJSON = readToJson(value)
    if (toJSON === UNREADABLE) {
      return UNSERIALIZABLE_TEXT
    }
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

export const redact = <T>(value: T, extraKeys?: readonly string[]): T =>
  walker.value(value, new WeakSet(), extraKeys) as T

/**
 * Clone request URL, method and headers for logging with the same string redaction as {@link redact}.
 * When nothing needed redacting the original request is returned. Otherwise the result is a
 * logging-only artifact carrying url/method/headers/signal and no body, so it never re-uses the
 * original (possibly already-consumed) request stream. The original request is left untouched.
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
