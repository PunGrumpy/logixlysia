const CIRCULAR_REF = '[Circular]'
const DEPTH_TEXT = '[Depth]'
const MAX_DEPTH = 64
const UNSERIALIZABLE = '"[Unserializable]"'

/**
 * What JSON would lose entirely: an Error's own fields are not enumerable,
 * and a Map or Set has no enumerable fields at all, so each would be `{}`.
 */
const toJsonShape = (value: object): object => {
  if (value instanceof Error) {
    const shape: Record<string, unknown> = {
      ...value,
      message: value.message,
      name: value.name
    }
    if (value.cause !== undefined) {
      shape.cause = value.cause
    }
    return shape
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value, ([key, entry]) => [String(key), entry])
    )
  }
  if (value instanceof Set) {
    return [...value]
  }
  return value
}

interface OpenLevel {
  origin: unknown
  plain: unknown
}

/**
 * True when plain `JSON.stringify` writes `value` as the replacer below
 * would: no BigInt, Error, Map, Set, custom `toJSON`, cycle or deep nesting.
 */
const isPlainJson = (value: unknown, ancestors: object[]): boolean => {
  if (typeof value === 'bigint') {
    return false
  }
  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return true
  }
  if (
    ancestors.length >= MAX_DEPTH - 1 ||
    ancestors.includes(value) ||
    value instanceof Error ||
    value instanceof Map ||
    value instanceof Set ||
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  ) {
    return false
  }
  ancestors.push(value)
  const children: unknown[] = Array.isArray(value)
    ? value
    : Object.values(value)
  for (const child of children) {
    if (!isPlainJson(child, ancestors)) {
      return false
    }
  }
  ancestors.pop()
  return true
}

const stringifyWithReplacer = (value: unknown): string => {
  const levels: OpenLevel[] = []
  const seen = new Set<unknown>()
  try {
    return (
      JSON.stringify(
        value,
        // A `function`, not an arrow, so `this` is the object holding `current`.
        function replacer(
          this: unknown,
          _key: string,
          current: unknown
        ): unknown {
          if (typeof current === 'bigint') {
            return current.toString()
          }
          if (typeof current !== 'object' || current === null) {
            return current
          }
          while (levels.length > 0 && levels.at(-1)?.plain !== this) {
            seen.delete(levels.pop()?.origin)
          }
          if (seen.has(current)) {
            return CIRCULAR_REF
          }
          if (levels.length >= MAX_DEPTH) {
            return DEPTH_TEXT
          }
          const plain = toJsonShape(current)
          levels.push({ origin: current, plain })
          seen.add(current)
          return plain
        }
      ) ?? ''
    )
  } catch {
    return UNSERIALIZABLE
  }
}

/**
 * `JSON.stringify` for log output that never throws. A BigInt becomes its
 * decimal string and a reference back to one of the value's own ancestors
 * becomes "[Circular]". A value shared by two siblings is written twice, as
 * JSON would. A value nested deeper than 64 levels becomes "[Depth]".
 * An `Error` is written as its `name`, `message`, `cause` and own fields (no
 * stack), a `Map` as an object keyed by `String(key)`, and a `Set` as an
 * array. Anything else that fails, such as a throwing `toJSON`, becomes
 * "[Unserializable]". Returns '' when there is nothing to write
 * (`undefined`, a function, a symbol).
 */
export const stringifyForLog = (value: unknown): string => {
  // The replacer costs a call into JS per value, several times the plain
  // stringify, so it runs only for values that need it.
  try {
    if (isPlainJson(value, [])) {
      return JSON.stringify(value) ?? ''
    }
  } catch {
    // A getter or `toJSON` threw. The replacer path gives the same result.
  }
  return stringifyWithReplacer(value)
}
