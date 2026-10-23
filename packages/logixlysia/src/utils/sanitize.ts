import { stringifyForLog } from './json'

/**
 * True for C0 controls other than tab and LF (0x00-0x08, 0x0B-0x1F), DEL
 * (0x7F), and C1 controls (0x80-0x9F).
 */
const isControlCodePoint = (code: number): boolean =>
  code <= 8 || (code >= 11 && code <= 31) || (code >= 127 && code <= 159)

export const toText = (value: unknown): string => {
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
