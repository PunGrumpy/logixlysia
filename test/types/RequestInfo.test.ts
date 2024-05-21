import { describe, expect, it } from 'bun:test'

import { RequestInfo } from '~/types'

describe('Request Infomation interface', () => {
  it('Defines the RequestInfo interface correctly', () => {
    const headers = { get: () => 'value' }
    const method = 'GET'
    const url = 'https://example.com/api'

    const request: RequestInfo = { headers, method, url }

    expect(request).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          get: expect.any(Function)
        }),
        method: expect.any(String),
        url: expect.any(String)
      })
    )
  })
})
