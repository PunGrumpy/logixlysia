import type { LogFilter } from '../interfaces'
import { globToRegExp, isMatchablePath, matchesAnyGlob } from '../sampling/glob'
import { parseRequestUrlOnce } from '../utils/request-url'
import { isJobRequest } from '../utils/synthetic-request'

/** Decides once per request whether its records are written at all. */
export interface PathFilter {
  excludes: (request: Request) => boolean
}

/**
 * Compiles `include`/`exclude` into a filter of its own, with its own
 * per-request verdicts; `undefined` when neither is set. The caller builds it
 * once and hands the same filter to everything that must agree on a request.
 */
export const resolvePathFilter = (
  filter: LogFilter | undefined
): PathFilter | undefined => {
  const exclude = filter?.exclude?.map(globToRegExp) ?? []
  const include = filter?.include?.map(globToRegExp) ?? []
  if (exclude.length === 0 && include.length === 0) {
    return
  }

  const verdicts = new WeakMap<Request, boolean>()
  const decide = (request: Request): boolean => {
    // A job is not a route; its name is not a path to match.
    if (isJobRequest(request)) {
      return false
    }
    const { pathname } = parseRequestUrlOnce(request)
    // A path too long to match is logged, or padding one would hide a route.
    if (!isMatchablePath(pathname)) {
      return false
    }
    if (matchesAnyGlob(exclude, pathname)) {
      return true
    }
    return include.length > 0 && !matchesAnyGlob(include, pathname)
  }

  return {
    excludes(request) {
      let verdict = verdicts.get(request)
      if (verdict === undefined) {
        verdict = decide(request)
        verdicts.set(request, verdict)
      }
      return verdict
    }
  }
}
