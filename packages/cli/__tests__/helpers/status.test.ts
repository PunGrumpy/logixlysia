import { describe, expect, test } from 'bun:test'

import { getStatusCode } from '../../src/helpers/status'

describe('getStatusCode', () => {
  test('should return correct status code for valid input', () => {
    expect(getStatusCode(200)).toBe(200)
    expect(getStatusCode(404)).toBe(404)
    expect(getStatusCode(500)).toBe(500)
  })

  test('should return 500 for invalid input', () => {
    expect(getStatusCode('invalid')).toBe(500)
  })

  test('should handle string input', () => {
    expect(getStatusCode('OK')).toBe(200)
    expect(getStatusCode('Not Found')).toBe(404)
  })
})
