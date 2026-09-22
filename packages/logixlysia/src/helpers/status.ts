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
