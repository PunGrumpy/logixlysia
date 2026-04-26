const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g

const REDACTED_TEXT = '[REDACTED]'

export const redactString = (text: string): string => {
  let result = text

  result = result.replace(EMAIL_REGEX, REDACTED_TEXT)
  result = result.replace(IPV4_REGEX, REDACTED_TEXT)
  result = result.replace(CREDIT_CARD_REGEX, REDACTED_TEXT)
  result = result.replace(JWT_REGEX, REDACTED_TEXT)

  return result
}

export const redact = <T>(value: T): T => {
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
    return new Date(value.getTime()) as unknown as T
  }

  if (value instanceof Error) {
    const originalError = value
    const redactedMessage = redactString(originalError.message)
    const newError = new Error(redactedMessage)

    newError.name = originalError.name

    if (originalError.stack !== undefined) {
      newError.stack = redactString(originalError.stack)
    }

    const errorRecord = originalError as unknown as Record<string, unknown>
    const newErrorRecord = newError as unknown as Record<string, unknown>

    for (const key of Object.keys(errorRecord)) {
      if (key !== 'message' && key !== 'name' && key !== 'stack') {
        newErrorRecord[key] = redact(errorRecord[key])
      }
    }

    return newError as unknown as T
  }

  if (Array.isArray(value)) {
    const redactedArray = Array.from({ length: value.length })

    for (let i = 0; i < value.length; i++) {
      redactedArray[i] = redact(value[i])
    }

    return redactedArray as unknown as T
  }

  const recordValue = value as Record<string, unknown>
  const redactedRecord: Record<string, unknown> = {}

  for (const key of Object.keys(recordValue)) {
    redactedRecord[key] = redact(recordValue[key])
  }

  return redactedRecord as unknown as T
}

/**
 * Clone request URL and headers for logging with the same string redaction as {@link redact}.
 * Preserves body and signal so the original request is still usable.
 */
export const redactRequest = (request: Request): Request => {
  const redactedUrl = redactString(request.url)
  const nextHeaders = new Headers()
  let headersChanged = false

  for (const [name, value] of request.headers.entries()) {
    const redacted = redactString(value)
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

  const init: RequestInit & { duplex?: 'half' } = {
    method: redactedMethod,
    headers: nextHeaders,
    redirect: request.redirect,
    signal: request.signal
  }

  if (request.body !== null) {
    init.body = request.body
    init.duplex = 'half'
  }

  return new Request(redactedUrl, init)
}

