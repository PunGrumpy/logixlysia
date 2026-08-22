import { describe, expect, test } from 'bun:test'

import { globToRegExp } from '../../src/sampling/glob'

describe('globToRegExp', () => {
  test('matches a literal path exactly', () => {
    const pattern = globToRegExp('/v1/users')
    expect(pattern.test('/v1/users')).toBe(true)
    expect(pattern.test('/v1/users/1')).toBe(false)
    expect(pattern.test('/api/v1/users')).toBe(false)
  })

  test('single star stays inside one segment', () => {
    const pattern = globToRegExp('/v1/*')
    expect(pattern.test('/v1/users')).toBe(true)
    expect(pattern.test('/v1/')).toBe(true)
    expect(pattern.test('/v1/users/1')).toBe(false)
  })

  test('double star crosses segments', () => {
    const pattern = globToRegExp('/checkout/**')
    expect(pattern.test('/checkout/')).toBe(true)
    expect(pattern.test('/checkout/cart/items')).toBe(true)
    expect(pattern.test('/checkouts')).toBe(false)
  })

  test('question mark matches one non-slash character', () => {
    const pattern = globToRegExp('/v?/users')
    expect(pattern.test('/v1/users')).toBe(true)
    expect(pattern.test('/v12/users')).toBe(false)
    expect(pattern.test('//users')).toBe(false)
  })

  test('regex metacharacters in the pattern are literal', () => {
    const pattern = globToRegExp('/files/report.pdf')
    expect(pattern.test('/files/report.pdf')).toBe(true)
    expect(pattern.test('/files/reportXpdf')).toBe(false)
  })

  test('an empty pattern matches only the empty string', () => {
    const pattern = globToRegExp('')
    expect(pattern.test('')).toBe(true)
    expect(pattern.test('/')).toBe(false)
  })
})
