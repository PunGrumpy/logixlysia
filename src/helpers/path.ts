import { RequestInfo } from '../interfaces'

export default function pathString(
  requestInfo: RequestInfo
): string | undefined {
  try {
    return new URL(requestInfo.url).pathname
  } catch {
    return undefined
  }
}
