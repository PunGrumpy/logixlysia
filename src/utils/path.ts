interface RequestInfo {
  headers: { get: (key: string) => any }
  method: string
  url: string
}

function pathString(path: RequestInfo): string {
  const url = new URL(path?.url).pathname
  return url
}

export { pathString, RequestInfo }
