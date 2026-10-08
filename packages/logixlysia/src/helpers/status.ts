import { StatusMap } from 'elysia'

const DIGITS_ONLY = /^\d+$/u
const DELIMITERS = /[_-]+/gu
const CAMEL_BOUNDARY_1 = /(?<before>[a-z0-9])(?<after>[A-Z])/gu
const CAMEL_BOUNDARY_2 = /(?<before>[A-Z])(?<after>[A-Z][a-z])/gu
const APOSTROPHES = /['’]/gu
const NON_ALPHANUMERIC = /[^a-z0-9\s]+/gu
const WHITESPACE = /\s+/gu

const normalizeStatusName = (value: string): string => {
  // Handles common variants:
  // - case differences: "not found" vs "Not Found"
  // - spacing/punctuation: "Not-Found", "not_found"
  // - camelCase/PascalCase: "InternalServerError"
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed
    .replace(DELIMITERS, ' ')
    .replace(CAMEL_BOUNDARY_1, '$<before> $<after>')
    .replace(CAMEL_BOUNDARY_2, '$<before> $<after>')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
}

const STATUS_BY_NORMALIZED_NAME = (() => {
  const map = new Map<string, number>()

  for (const [name, code] of Object.entries(StatusMap)) {
    map.set(normalizeStatusName(name), code)
  }

  return map
})()

/**
 * What Elysia's `status(code, body)` returns or throws: a numeric `code` and
 * the `response` body. Matched by shape instead of `instanceof`, so it still
 * works when the app resolves a second copy of Elysia. Elysia's own error
 * classes are `Error`s with string codes, so they never match.
 */
export interface StatusResponseLike {
  code: number
  response: unknown
}

export const isStatusResponse = (value: unknown): value is StatusResponseLike =>
  typeof value === 'object' &&
  value !== null &&
  !(value instanceof Error) &&
  'code' in value &&
  typeof value.code === 'number' &&
  'response' in value

export const getStatusCode = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (DIGITS_ONLY.test(trimmed)) {
      return Number(trimmed)
    }

    const known = STATUS_BY_NORMALIZED_NAME.get(normalizeStatusName(trimmed))
    return known ?? 500
  }

  return 500
}

export const levelForStatus = (
  status: number
): 'INFO' | 'WARNING' | 'ERROR' => {
  if (status >= 500) {
    return 'ERROR'
  }
  if (status >= 400) {
    return 'WARNING'
  }
  return 'INFO'
}
