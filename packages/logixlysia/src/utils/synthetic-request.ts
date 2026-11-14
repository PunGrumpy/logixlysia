const SYNTHETIC_ORIGIN = 'http://logixlysia.local'

/** `new Request` normalises a method it does not know to `GET`, so the label is set on the instance. */
export const labelRequest = (request: Request, method: string): Request =>
  request.method === method
    ? request
    : Object.defineProperty(request, 'method', { value: method })

const jobRequests = new WeakSet<Request>()

/** True only for a request `runJob` made; a client can send any method, `JOB` included. */
export const isJobRequest = (request: Request): boolean =>
  jobRequests.has(request)

export const syntheticRequest = (method: string, path: string): Request => {
  const url = new URL(SYNTHETIC_ORIGIN)
  url.pathname = path
  const request = labelRequest(new Request(url), method)
  if (method === 'JOB') {
    jobRequests.add(request)
  }
  return request
}
