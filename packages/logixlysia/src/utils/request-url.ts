import { sanitizeLogText } from './sanitize'

const MAX_UNPARSABLE_URL_LENGTH = 1024

export const parseRequestUrlOnce = (
  request: Pick<Request, 'url'>
): { pathname: string; search: string } => {
  try {
    const { pathname, search } = new URL(request.url)
    return { pathname, search }
  } catch {
    return {
      pathname: sanitizeLogText(request.url || '/', MAX_UNPARSABLE_URL_LENGTH),
      search: ''
    }
  }
}
