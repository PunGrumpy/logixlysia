// What `Number.parseInt(value, 10)` reads: leading whitespace, an optional
// sign, then digits. Anything after the digits is ignored.
const LEADING_INTEGER = /^\s*(?<integer>[+-]?\d+)/u

/** `Number.parseInt(value, 10)`, spelled without `parseInt`: `NaN` when no digits lead. */
export const parseLeadingInteger = (value: string): number => {
  const match = LEADING_INTEGER.exec(value)
  return match ? Number(match[1]) : Number.NaN
}
