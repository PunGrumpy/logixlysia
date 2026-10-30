const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/gu
const REPEATED_RECURSIVE_PATTERN = /\*\*.*\*\*/u
const RECURSIVE_WILDCARD_SPLIT = /\*\*/u
const ALPHANUMERIC_PATTERN = /[a-zA-Z0-9]/u
const RECURSIVE_WILDCARD = /\*\*/gu
const SINGLE_WILDCARD = /\*/gu
const MAX_SINGLE_WILDCARDS_PER_SEGMENT = 2

const escapeRegExp = (value: string): string =>
  value.replace(REGEXP_SPECIALS, '\\$&')

const hasRepeatedRecursiveWildcards = (pattern: string): boolean => {
  if (!REPEATED_RECURSIVE_PATTERN.test(pattern)) {
    return false
  }

  const segments = pattern.split(RECURSIVE_WILDCARD_SPLIT)
  for (let i = 1; i < segments.length; i += 1) {
    const separator = segments[i]
    if (
      separator === '' ||
      (separator.length < 2 && !ALPHANUMERIC_PATTERN.test(separator))
    ) {
      return true
    }
  }

  return false
}

const hasTooManySingleWildcards = (pattern: string): boolean => {
  for (const segment of pattern.split('/')) {
    const stars = segment.replace(RECURSIVE_WILDCARD, '').match(SINGLE_WILDCARD)
    if (stars && stars.length > MAX_SINGLE_WILDCARDS_PER_SEGMENT) {
      return true
    }
  }

  return false
}

export const globToRegExp = (pattern: string): RegExp => {
  if (hasRepeatedRecursiveWildcards(pattern)) {
    throw new Error(
      'Invalid glob pattern: repeated recursive wildcards (**) can cause performance issues'
    )
  }

  if (hasTooManySingleWildcards(pattern)) {
    throw new Error(
      'Invalid glob pattern: more than two single wildcards (*) in one segment can cause performance issues'
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

  return new RegExp(`^${source}$`, 'u')
}
