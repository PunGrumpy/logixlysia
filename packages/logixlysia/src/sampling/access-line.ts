import type { LogFilter } from '../interfaces'
import { globToRegExp, isMatchablePath, matchesAnyGlob } from './glob'

export const resolveAccessLineFilter = (
  filter: LogFilter['accessLine']
): ((pathname: string) => boolean) | undefined => {
  const exclude = filter?.exclude?.map(globToRegExp) ?? []
  const include = filter?.include?.map(globToRegExp) ?? []
  if (exclude.length === 0 && include.length === 0) {
    return
  }
  return pathname => {
    if (!isMatchablePath(pathname)) {
      return false
    }
    if (matchesAnyGlob(exclude, pathname)) {
      return true
    }
    return include.length > 0 && !matchesAnyGlob(include, pathname)
  }
}
