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
