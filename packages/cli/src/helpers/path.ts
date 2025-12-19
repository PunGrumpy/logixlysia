import type { RequestInfo } from '../interfaces'

const pathString = (requestInfo: RequestInfo): string | undefined => {
  try {
    return new URL(requestInfo.url).pathname
  } catch {
    return
  }
}

export default pathString
