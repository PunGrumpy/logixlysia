import { StatusMap } from 'elysia'

const DIGITS_ONLY = /^\d+$/
const DELIMITERS = /[_-]+/g
const CAMEL_BOUNDARY_1 = /([a-z0-9])([A-Z])/g
const CAMEL_BOUNDARY_2 = /([A-Z])([A-Z][a-z])/g
const APOSTROPHES = /['’]/g
const NON_ALPHANUMERIC = /[^a-z0-9\s]+/g
const WHITESPACE = /\s+/g

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
    .replace(CAMEL_BOUNDARY_1, '$1 $2')
    .replace(CAMEL_BOUNDARY_2, '$1 $2')
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
