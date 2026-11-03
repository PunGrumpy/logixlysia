import { describe, expect, test } from 'bun:test'
import { geoEnricher } from '../../src/enrichers'

const requestWith = (headers: Record<string, string>): Request =>
  new Request('http://localhost/', { headers })

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64')

describe('geoEnricher Netlify header encoding', () => {
  const enricher = geoEnricher()

  test('decodes a non-ASCII city as UTF-8', () => {
    const fields = enricher.request?.(
      requestWith({ 'x-nf-geo': encode({ city: 'São Paulo' }) })
    )

    expect(fields?.geo).toEqual({ city: 'São Paulo' })
  })

  test('ignores a blob that is not valid UTF-8', () => {
    const invalid = Buffer.from([
      ...Buffer.from('{"city":"'),
      0xff,
      ...Buffer.from('"}')
    ]).toString('base64')

    expect(enricher.request?.(requestWith({ 'x-nf-geo': invalid }))).toBe(
      undefined
    )
  })
})
