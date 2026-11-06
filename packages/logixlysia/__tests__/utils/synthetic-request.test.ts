import { describe, expect, test } from 'bun:test'
import {
  labelRequest,
  syntheticRequest
} from '../../src/utils/synthetic-request'

describe('syntheticRequest', () => {
  test('keeps a method that Request would normalise to GET', () => {
    const request = syntheticRequest('JOB', 'nightly-sync')

    expect(request.method).toBe('JOB')
    expect(new URL(request.url).pathname).toBe('/nightly-sync')
  })

  test('encodes a query or fragment delimiter in the name', () => {
    const request = syntheticRequest('JOB', 'a?b#c')

    expect(new URL(request.url).pathname).toBe('/a%3Fb%23c')
    expect(new URL(request.url).search).toBe('')
  })

  test('returns a fresh request on every call', () => {
    expect(syntheticRequest('JOB', 'x')).not.toBe(syntheticRequest('JOB', 'x'))
  })
})

describe('labelRequest', () => {
  test('returns the same object when the method already matches', () => {
    const request = new Request('http://localhost/x')

    expect(labelRequest(request, 'GET')).toBe(request)
  })

  test('relabels the instance otherwise', () => {
    const request = new Request('http://localhost/x')

    expect(labelRequest(request, 'WS').method).toBe('WS')
  })
})
