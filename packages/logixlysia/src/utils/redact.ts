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
