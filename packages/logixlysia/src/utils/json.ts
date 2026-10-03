const CIRCULAR_REF = '[Circular]'
const UNSERIALIZABLE = '"[Unserializable]"'

/**
 * `JSON.stringify` for log output that never throws. A BigInt becomes its
 * decimal string and a reference back to one of the value's own ancestors
 * becomes "[Circular]". A value shared by two siblings is written twice, as
 * JSON would. Anything else that fails, such as a throwing `toJSON`, becomes
 * "[Unserializable]". Returns '' when there is nothing to write (`undefined`,
 * a function, a symbol).
 */
export const stringifyForLog = (value: unknown): string => {
  const ancestors: unknown[] = []
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
          while (ancestors.length > 0 && ancestors.at(-1) !== this) {
            ancestors.pop()
          }
          if (ancestors.includes(current)) {
            return CIRCULAR_REF
          }
          ancestors.push(current)
          return current
        }
      ) ?? ''
    )
  } catch {
    return UNSERIALIZABLE
  }
}
