const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g
const REPEATED_RECURSIVE_PATTERN = /\*\*.*\*\*/
const RECURSIVE_WILDCARD_SPLIT = /\*\*/
const ALPHANUMERIC_PATTERN = /[a-zA-Z0-9]/

const escapeRegExp = (value: string): string =>
  value.replace(REGEXP_SPECIALS, '\\$&')

/**
 * Detects if a pattern contains repeated recursive wildcards that could cause ReDoS.
 * Patterns with adjacent or nearly-adjacent `**` wildcards can lead to catastrophic backtracking.
 */
const hasRepeatedRecursiveWildcards = (pattern: string): boolean => {
  if (!REPEATED_RECURSIVE_PATTERN.test(pattern)) {
    return false
  }

  const segments = pattern.split(RECURSIVE_WILDCARD_SPLIT)
  // If we have multiple ** with only short literal separators between them, reject it
  for (let i = 1; i < segments.length; i += 1) {
    const separator = segments[i]
    // Allow ** followed by reasonable literal paths, but reject adjacent or nearly-adjacent **
    if (
      separator === '' ||
      (separator.length < 2 && !ALPHANUMERIC_PATTERN.test(separator))
    ) {
      return true
    }
  }

  return false
}

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
  // Detect repeated recursive wildcards that could cause catastrophic backtracking.
  if (hasRepeatedRecursiveWildcards(pattern)) {
    throw new Error(
      'Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues'
    )
  }

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
