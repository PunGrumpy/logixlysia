import { describe, expect, it } from 'bun:test'

import { RequestInfo } from '~/types'
import pathString from '~/utils/path'

describe('Path String', () => {
  it('Extracts the pathname from a valid URL', () => {
    const testPath: RequestInfo = {
      url: 'https://www.example.com/path/to/resource',
      headers: new Map(),
      method: 'GET'
    }
    const result = pathString(testPath)
    expect(result).toBe('/path/to/resource')
  })

  it('Handles malformed URL gracefully', () => {
    const testPath: RequestInfo = {
      url: 'invalid url',
      headers: new Map(),
      method: 'GET'
    }
    const result = pathString(testPath)
    expect(result).toBeUndefined()
  })

  it('Returns undefined if the URL is missing', () => {
    const testPath: RequestInfo = {
      url: '',
      headers: new Map(),
      method: 'GET'
    }
    const result = pathString(testPath)
    expect(result).toBeUndefined()
  })
})
