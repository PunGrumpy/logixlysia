import { StatusMap } from 'elysia'

const DIGITS_ONLY = /^\d+$/u
const DELIMITERS = /[_-]+/gu
const CAMEL_BOUNDARY_1 = /(?<before>[a-z0-9])(?<after>[A-Z])/gu
const CAMEL_BOUNDARY_2 = /(?<before>[A-Z])(?<after>[A-Z][a-z])/gu
const APOSTROPHES = /['’]/gu
const NON_ALPHANUMERIC = /[^a-z0-9\s]+/gu
const WHITESPACE = /\s+/gu

const normalizeStatusName = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  return trimmed
    .replaceAll(DELIMITERS, ' ')
    .replaceAll(CAMEL_BOUNDARY_1, '$<before> $<after>')
    .replaceAll(CAMEL_BOUNDARY_2, '$<before> $<after>')
    .replaceAll(APOSTROPHES, '')
    .toLowerCase()
    .replaceAll(NON_ALPHANUMERIC, ' ')
    .replaceAll(WHITESPACE, ' ')
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
 * the `response` body.
 */
export interface StatusResponseLike {
  code: number
  response: unknown
}

/**
 * Reads a `status()` result from either Elysia line: 1.x builds an
 * `ElysiaCustomStatusResponse` with `code`, 2.x an `ElysiaStatus` with
 * `status` and no `response` for a bodiless code. Matched by the class name
 * Elysia's own `mapResponse` checks rather than by `instanceof`, so it still
 * works when the app resolves a second copy of Elysia, and a plain object
 * with the same keys (an API envelope, say) never matches.
 */
export const asStatusResponse = (
  value: unknown
): StatusResponseLike | undefined => {
  if (typeof value !== 'object' || value === null || value instanceof Error) {
    return
  }
  const fields = value as {
    code?: unknown
    constructor?: { name?: string }
    response?: unknown
    status?: unknown
  }
  const className = fields.constructor?.name
  if (
    className === 'ElysiaCustomStatusResponse' &&
    typeof fields.code === 'number' &&
    'response' in value
  ) {
    return value as StatusResponseLike
  }
  if (className === 'ElysiaStatus' && typeof fields.status === 'number') {
    return { code: fields.status, response: fields.response }
  }
}

export const isStatusResponse = (value: unknown): boolean =>
  asStatusResponse(value) !== undefined

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
