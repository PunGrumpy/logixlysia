const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g

const escapeRegExp = (value: string): string =>
  value.replace(REGEXP_SPECIALS, '\\$&')

/**
 * Compiles a path glob into an anchored `RegExp`.
 *
 * - `**` matches any characters, including `/`
 * - `*` matches any characters except `/`
 * - `?` matches a single character except `/`
 *
 * Everything else is matched literally, so `/v1/users` only matches itself.
 */
export const globToRegExp = (pattern: string): RegExp => {
  let source = ''
  let index = 0

  while (index < pattern.length) {
    const char = pattern[index]

    if (char === '*') {
      const crossesSegments = pattern[index + 1] === '*'
      source += crossesSegments ? '.*' : '[^/]*'
      index += crossesSegments ? 2 : 1
      continue
    }

    if (char === '?') {
      source += '[^/]'
      index += 1
      continue
    }

    source += escapeRegExp(char)
    index += 1
  }

  return new RegExp(`^${source}$`)
}
