export const createMockRequest = (
  url = 'http://localhost/test',
  init?: RequestInit
): Request => new Request(url, init)
