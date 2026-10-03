import { stringifyForLog } from './json'

/**
 * True for C0 controls (0x00-0x08, 0x0B-0x1F), DEL (0x7F), and C1 controls
 * (0x80-0x9F). Tab, LF, and CR are handled separately by the caller before
 * this check runs, so they are intentionally included here as a safety net
 * in case a caller skips that step.
 */
const isControlCodePoint = (code: number): boolean =>
  code <= 8 || (code >= 11 && code <= 31) || (code >= 127 && code <= 159)

const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return stringifyForLog(value)
  }
  return String(value)
}

/**
 * Turns any value into one safe line of text. Objects are serialized, `\r`,
 * `\n` and `\t` become visible escapes, other C0/C1 control characters are
 * stripped, and the length is bounded. Never throws.
 */
export const sanitizeLogText = (value: unknown, maxLength = 2048): string => {
  const escaped = toText(value)
    .replaceAll('\r', String.raw`\r`)
    .replaceAll('\n', String.raw`\n`)
    .replaceAll('\t', String.raw`\t`)

  let out = ''
  for (const char of escaped) {
    const code = char.codePointAt(0) ?? 0
    if (!isControlCodePoint(code)) {
      out += char
    }
  }

  if (out.length > maxLength) {
    out = `${out.slice(0, maxLength)}…`
  }
  return out
}
