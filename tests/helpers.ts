import { mock } from 'bun:test'

import { RequestInfo } from '../src/types'

export function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/'
): RequestInfo {
  return {
    headers: {
      get: (key: string) => (key === 'x-forwarded-for' ? '127.0.0.1' : null)
    },
    method,
    url
  }
}

export const mockConsoleLog = mock(() => {})
export const mockConsoleError = mock(() => {})
