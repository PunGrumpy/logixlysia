const SYNTHETIC_ORIGIN = 'http://logixlysia.local'

/** `new Request` normalises a method it does not know to `GET`, so the label is set on the instance. */
export const labelRequest = (request: Request, method: string): Request =>
  request.method === method
    ? request
    : Object.defineProperty(request, 'method', { value: method })

export const syntheticRequest = (method: string, path: string): Request => {
  const url = new URL(SYNTHETIC_ORIGIN)
  url.pathname = path
  return labelRequest(new Request(url), method)
}
