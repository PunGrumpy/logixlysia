import { describe, expect, it } from 'bun:test'
import pathString from '~/utils/path'

describe('Path String', () => {
  it('Returns the path string from a URL', () => {
    const testPath: any = { url: 'https://www.example.com/path/to/resource' }
    const result = pathString(testPath)
    expect(result).toMatch('/path/to/resource')
  })
})
