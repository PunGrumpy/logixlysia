// Local part ≤64, domain ≤253, TLD 2–63 (RFC 5321 / 1035-ish limits; bounded to avoid ReDoS)
const EMAIL_REGEX =
  /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,63}/gu
const IPV4_REGEX =
  /(?<![\w/.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\w.])/gu
const IPV6_REGEX =
  /(?<![\w:])(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6})?|::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){0,6}))(?![\w:])/gu
/**
 * A whole run of digit groups, however long. A pattern that stops at the first
 * 13 digits it can take cuts a card written one digit at a time short, and
 * starts in the number written before a card instead of at the card.
 */
const CREDIT_CARD_CANDIDATE_REGEX = /\b\d(?:[ -]*\d){12,}\b/gu
const DIGIT_GROUP_REGEX = /\d+/gu
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

export interface RedactRules {
  keys?: readonly string[]
  patterns?: readonly RegExp[]
}

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
    .replaceAll(CAMEL_CASE_BOUNDARY_REGEX, '$<before>-$<after>')
    .replaceAll('_', '-')
    .toLowerCase()

const SENSITIVE_KEY_PARTS: ReadonlySet<string> = new Set([
  'authorization',
  'jwt',
  'passwd',
  'password',
  'secret'
])
const SENSITIVE_LAST_KEY_PART = 'token'
const KEY_PART = 'key'
const SENSITIVE_KEY_QUALIFIERS: ReadonlySet<string> = new Set([
  'access',
  'api',
  'private',
  'signing'
])

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
  const lastPart = parts.at(-1)
  const qualifier = parts.at(-2)
  const endsInQualifiedKey =
    lastPart === KEY_PART &&
    qualifier !== undefined &&
    SENSITIVE_KEY_QUALIFIERS.has(qualifier)
  return (
    parts.some(part => SENSITIVE_KEY_PARTS.has(part)) ||
    lastPart === SENSITIVE_LAST_KEY_PART ||
    endsInQualifiedKey
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

const ZERO_CODE_POINT = 48

/** Luhn check over `digits[from, to)`, which holds decimal digits only. */
const passesLuhn = (digits: string, from: number, to: number): boolean => {
  let sum = 0
  let alternate = false

  for (let i = to - 1; i >= from; i -= 1) {
    let n = (digits.codePointAt(i) ?? ZERO_CODE_POINT) - ZERO_CODE_POINT
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

interface DigitRun {
  /** Every digit of the run, separators dropped. */
  digits: string
  /** Per group: how many digits the run holds up to the end of that group. */
  digitsThrough: number[]
  groups: RegExpExecArray[]
}

/**
 * Index of the group that ends the longest card starting at group `first`, or
 * -1. Longest first, so a shorter prefix that happens to pass the check does
 * not leave the card's last digits in the log.
 */
const lastGroupOfCard = (run: DigitRun, first: number): number => {
  const from = first === 0 ? 0 : (run.digitsThrough[first - 1] ?? 0)
  let last = first
  while ((run.digitsThrough[last + 1] ?? Infinity) - from <= PAN_MAX_LEN) {
    last += 1
  }
  for (; last >= first; last -= 1) {
    const to = run.digitsThrough[last] ?? 0
    const length = to - from
    if (length < PAN_MIN_LEN) {
      return -1
    }
    if (length <= PAN_MAX_LEN && passesLuhn(run.digits, from, to)) {
      return last
    }
  }
  return -1
}

/**
 * A card is a window of whole digit groups inside the run, so `id 12` in front
 * of a card or a CVV after it does not hide the card.
 */
const redactCardsInRun = (text: string): string => {
  const run: DigitRun = { digits: '', digitsThrough: [], groups: [] }
  for (const group of text.matchAll(DIGIT_GROUP_REGEX)) {
    run.digits += group[0]
    run.digitsThrough.push(run.digits.length)
    run.groups.push(group)
  }

  let result = ''
  let copiedTo = 0
  let first = 0
  while (first < run.groups.length) {
    const last = lastGroupOfCard(run, first)
    const lastGroup = run.groups[last]
    if (lastGroup === undefined) {
      first += 1
    } else {
      const start = run.groups[first]?.index ?? 0
      result += `${text.slice(copiedTo, start)}${REDACTED_TEXT}`
      copiedTo = lastGroup.index + lastGroup[0].length
      first = last + 1
    }
  }

  return copiedTo === 0 ? text : `${result}${text.slice(copiedTo)}`
}

const redactCreditCardCandidates = (text: string): string =>
  text.replaceAll(CREDIT_CARD_CANDIDATE_REGEX, redactCardsInRun)

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

export const redactString = (
  text: string,
  patterns?: readonly RegExp[]
): string => {
  let result = text

  for (const pattern of patterns ?? []) {
    result = result.replaceAll(pattern, REDACTED_TEXT)
  }

  // A pattern is skipped only when the text lacks what every match contains.
  // Every match contains `://`.
  if (result.includes('://')) {
    result = result.replaceAll(
      URL_PASSWORD_REGEX,
      (match: string, prefix: string, offset: number, whole: string) =>
        endsWithUrlScheme(whole, offset) ? `${prefix}${REDACTED_TEXT}@` : match
    )
  }
  // Every match contains `@`.
  if (result.includes('@')) {
    result = result.replaceAll(EMAIL_REGEX, REDACTED_TEXT)
  }
  // Every match contains `.`.
  if (result.includes('.')) {
    result = result.replaceAll(IPV4_REGEX, REDACTED_TEXT)
  }
  // Every match contains `:`.
  if (result.includes(':')) {
    result = result.replaceAll(IPV6_REGEX, REDACTED_TEXT)
  }
  // Every candidate holds at least PAN_MIN_LEN digits.
  if (result.length >= PAN_MIN_LEN) {
    result = redactCreditCardCandidates(result)
  }
  // Every match contains `eyJ`.
  if (result.includes('eyJ')) {
    result = result.replaceAll(JWT_REGEX, REDACTED_TEXT)
  }
  // Every match contains `earer` or `asic`.
  if (result.includes('earer') || result.includes('asic')) {
    result = result.replaceAll(
      HTTP_CREDENTIAL_REGEX,
      (match: string, scheme: string, token: string) =>
        looksLikeCredential(token) ? `${scheme} ${REDACTED_TEXT}` : match
    )
  }

  return result
}

/**
 * The host cannot hold `[REDACTED]`: `[` opens an IPv6 literal. Userinfo would
 * percent-encode it, so one bracket-free token serves both.
 */
const URL_SAFE_REDACT = 'redacted'

const redactUrlAuthoritySegment = (
  value: string,
  rules?: RedactRules
): string =>
  redactString(value, rules?.patterns).replaceAll(
    REDACTED_TEXT,
    URL_SAFE_REDACT
  )

const redactSearchParams = (
  params: URLSearchParams,
  rules?: RedactRules
): URLSearchParams => {
  const result = new URLSearchParams()
  for (const [key, value] of params) {
    result.append(
      key,
      isSensitiveKey(key, rules?.keys)
        ? URL_SAFE_REDACT
        : redactString(value, rules?.patterns)
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

const redactPathSegment = (segment: string, rules?: RedactRules): string => {
  const decoded = decodeOrRaw(segment)
  const redacted = redactString(decoded, rules?.patterns)
  if (decoded === segment) {
    return redacted
  }
  return redacted === decoded ? segment : encodeURIComponent(redacted)
}

const redactRequestUrl = (urlString: string, rules?: RedactRules): string => {
  try {
    const u = new URL(urlString)
    if (u.username !== '') {
      u.username = redactUrlAuthoritySegment(u.username, rules)
    }
    if (u.password !== '') {
      u.password = URL_SAFE_REDACT
    }
    u.hostname = redactUrlAuthoritySegment(u.hostname, rules)
    const pathname = u.pathname
      .split('/')
      .map(segment => redactPathSegment(segment, rules))
      .join('/')
    if (pathname !== u.pathname) {
      u.pathname = pathname
    }
    // Assigning `search` re-serializes the query, so do it only when a value
    // changed. The values are decoded here, so patterns never run against
    // percent-encoded text.
    const query = redactSearchParams(u.searchParams, rules).toString()
    if (query !== u.searchParams.toString()) {
      u.search = query
    }
    u.hash = redactString(u.hash, rules?.patterns)
    return u.toString()
  } catch {
    return redactString(urlString, rules?.patterns).replaceAll(
      REDACTED_TEXT,
      URL_SAFE_REDACT
    )
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
  rules?: RedactRules
): string => {
  if (isSensitiveKey(name, rules?.keys)) {
    return REDACTED_TEXT
  }
  if (!URL_VALUED_HEADERS.has(name.toLowerCase())) {
    return redactString(value, rules?.patterns)
  }
  const redacted = redactRequestUrl(value, rules)
  // Keep the client's spelling when nothing was masked: serialising a URL
  // alone adds a trailing slash, and a changed header clones the request.
  return redacted === normalizedHref(value) ? value : redacted
}

const redactHeaders = (headers: Headers, rules?: RedactRules): Headers => {
  const result = new Headers()
  for (const [name, value] of headers) {
    result.append(name, redactHeaderValue(name, value, rules))
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
    rules?: RedactRules
  ): unknown[] => {
    let result: unknown[] | undefined

    for (const [index, original] of value.entries()) {
      const redacted = walker.value(original, inProgress, rules)
      if (result === undefined && redacted !== original) {
        result = value.slice(0, index)
      }
      result?.push(redacted)
    }

    return result ?? value
  },

  error: (
    originalError: Error,
    inProgress: WeakSet<object>,
    rules?: RedactRules
  ): Error & Record<string, unknown> => {
    const redactedMessage = redactString(originalError.message, rules?.patterns)
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
      defineOwn('stack', redactString(originalError.stack, rules?.patterns))
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

      const redactedValue = isSensitiveKey(key, rules?.keys)
        ? REDACTED_TEXT
        : walker.value(current, inProgress, rules)

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
    rules?: RedactRules
  ): Map<unknown, unknown> => {
    const result = new Map<unknown, unknown>()
    for (const [key, entry] of value) {
      const sensitive =
        typeof key === 'string' && isSensitiveKey(key, rules?.keys)
      result.set(
        key,
        sensitive ? REDACTED_TEXT : walker.value(entry, inProgress, rules)
      )
    }
    return result
  },

  record: (
    recordValue: Record<string, unknown>,
    inProgress: WeakSet<object>,
    rules?: RedactRules
  ): Record<string, unknown> | string => {
    let keys: string[]
    try {
      keys = Object.keys(recordValue)
    } catch {
      return UNSERIALIZABLE_TEXT
    }
    let entries: [string, unknown][] | undefined

    for (const [index, key] of keys.entries()) {
      let original: unknown
      let unreadable = false
      try {
        original = recordValue[key]
      } catch {
        unreadable = true
      }
      const sensitive = isSensitiveKey(key, rules?.keys)
      let redacted: unknown = REDACTED_TEXT
      if (unreadable) {
        redacted = UNSERIALIZABLE_TEXT
      } else if (!sensitive) {
        redacted = walker.value(original, inProgress, rules)
      }

      if (
        entries === undefined &&
        (sensitive || unreadable || redacted !== original)
      ) {
        entries = keys
          .slice(0, index)
          .map((priorKey): [string, unknown] => [
            priorKey,
            recordValue[priorKey]
          ])
      }
      entries?.push([key, redacted])
    }

    return entries ? Object.fromEntries(entries) : recordValue
  },

  set: (
    value: Set<unknown>,
    inProgress: WeakSet<object>,
    rules?: RedactRules
  ): Set<unknown> =>
    new Set(Array.from(value, item => walker.value(item, inProgress, rules))),

  toJson: (
    value: { toJSON: () => unknown },
    inProgress: WeakSet<object>,
    rules?: RedactRules
  ): unknown => {
    let plain: unknown
    try {
      plain = value.toJSON()
    } catch {
      return UNSERIALIZABLE_TEXT
    }
    const toJsonReturnedItself = plain === value
    if (toJsonReturnedItself) {
      return walker.record(
        value as unknown as Record<string, unknown>,
        inProgress,
        rules
      )
    }
    return walker.value(plain, inProgress, rules)
  },

  value: (
    value: unknown,
    inProgress: WeakSet<object>,
    rules?: RedactRules
  ): unknown => {
    if (typeof value === 'string') {
      return redactString(value, rules?.patterns)
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
      return redactHeaders(value, rules)
    }

    if (value instanceof URLSearchParams) {
      return redactSearchParams(value, rules)
    }

    if (value instanceof URL) {
      try {
        return new URL(redactRequestUrl(value.href, rules))
      } catch {
        return REDACTED_TEXT
      }
    }

    if (value instanceof Map) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.map(value, inProgress, rules)
      )
    }

    if (value instanceof Set) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.set(value, inProgress, rules)
      )
    }

    if (value instanceof Error) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.error(value, inProgress, rules)
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
        walker.toJson(value as { toJSON: () => unknown }, inProgress, rules)
      )
    }

    if (Array.isArray(value)) {
      return withReentrancyGuard(value, inProgress, () =>
        walker.array(value, inProgress, rules)
      )
    }

    return withReentrancyGuard(value, inProgress, () =>
      walker.record(value as Record<string, unknown>, inProgress, rules)
    )
  }
}

export const redact = <T>(value: T, rules?: RedactRules): T =>
  walker.value(value, new WeakSet(), rules) as T

/** The part of a request the log sinks read. */
export type LoggedRequest = Pick<Request, 'headers' | 'method' | 'url'>

/**
 * The request URL, method and headers with the same string redaction as
 * {@link redact}. Headers are redacted on first read, since most formats never
 * print one. The original request is left untouched.
 */
export const redactRequest = (
  request: Request,
  rules?: RedactRules
): LoggedRequest => {
  let headers: Headers | undefined
  return {
    get headers() {
      headers ??= redactHeaders(request.headers, rules)
      return headers
    },
    method: redactString(request.method, rules?.patterns),
    url: redactRequestUrl(request.url, rules)
  }
}
