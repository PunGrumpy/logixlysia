import { describe, expect, test } from 'bun:test'

import {
  geoEnricher,
  sizeEnricher,
  traceparentEnricher,
  userAgentEnricher
} from '../../src/enrichers'

const requestWith = (headers: Record<string, string>): Request =>
  new Request('http://localhost/', { headers })

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const SPAN_ID = '00f067aa0ba902b7'

describe('traceparentEnricher', () => {
  const enricher = traceparentEnricher()

  test('parses a valid version 00 header', () => {
    const fields = enricher.request?.(
      requestWith({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` })
    )

    expect(fields).toEqual({
      span_id: SPAN_ID,
      trace_flags: '01',
      trace_id: TRACE_ID,
      trace_sampled: true
    })
  })

  test('reports an unsampled trace', () => {
    const fields = enricher.request?.(
      requestWith({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-00` })
    )

    expect(fields?.trace_sampled).toBe(false)
  })

  test('accepts a future version with extra fields', () => {
    const fields = enricher.request?.(
      requestWith({ traceparent: `01-${TRACE_ID}-${SPAN_ID}-01-extra` })
    )

    expect(fields?.trace_id).toBe(TRACE_ID)
  })

  test('rejects version 00 with a trailing field', () => {
    expect(
      enricher.request?.(
        requestWith({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-01-extra` })
      )
    ).toBeUndefined()
  })

  test.each([
    ['no header', {}],
    ['garbage', { traceparent: 'not-a-traceparent' }],
    ['reserved version ff', { traceparent: `ff-${TRACE_ID}-${SPAN_ID}-01` }],
    [
      'all-zero trace id',
      { traceparent: `00-${'0'.repeat(32)}-${SPAN_ID}-01` }
    ],
    [
      'all-zero span id',
      { traceparent: `00-${TRACE_ID}-${'0'.repeat(16)}-01` }
    ],
    [
      'uppercase hex',
      { traceparent: `00-${TRACE_ID.toUpperCase()}-${SPAN_ID}-01` }
    ],
    ['short trace id', { traceparent: `00-abc-${SPAN_ID}-01` }]
  ])('ignores %s', (_label, headers) => {
    expect(enricher.request?.(requestWith(headers))).toBeUndefined()
  })

  test('records tracestate only when asked', () => {
    const headers = {
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      tracestate: 'vendor=value'
    }

    expect(
      traceparentEnricher().request?.(requestWith(headers))?.tracestate
    ).toBeUndefined()
    expect(
      traceparentEnricher({ tracestate: true }).request?.(requestWith(headers))
        ?.tracestate
    ).toBe('vendor=value')
  })

  test('truncates an oversized tracestate', () => {
    const fields = traceparentEnricher({ tracestate: true }).request?.(
      requestWith({
        traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
        tracestate: `vendor=${'x'.repeat(1000)}`
      })
    )

    expect(String(fields?.tracestate).length).toBe(512)
  })

  test('reads a custom header', () => {
    const fields = traceparentEnricher({ header: 'x-trace' }).request?.(
      requestWith({ 'x-trace': `00-${TRACE_ID}-${SPAN_ID}-01` })
    )

    expect(fields?.trace_id).toBe(TRACE_ID)
  })
})

describe('userAgentEnricher', () => {
  const enricher = userAgentEnricher()

  const parse = (userAgent: string) =>
    enricher.request?.(requestWith({ 'user-agent': userAgent }))?.ua as
      | Record<string, unknown>
      | undefined

  test('adds nothing without a user-agent header', () => {
    expect(enricher.request?.(requestWith({}))).toBeUndefined()
  })

  test('identifies desktop Chrome', () => {
    expect(
      parse(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      )
    ).toEqual({
      bot: false,
      browser: 'Chrome',
      browserVersion: '131.0.0.0',
      device: 'desktop',
      os: 'macOS'
    })
  })

  test('prefers Edge over the Chrome token it also carries', () => {
    expect(
      parse(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'
      )
    ).toMatchObject({ browser: 'Edge', os: 'Windows' })
  })

  test('identifies Edge on iOS', () => {
    expect(
      parse(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/131.0.2903.48 Mobile/15E148 Safari/605.1.15'
      )
    ).toMatchObject({
      browser: 'Edge',
      browserVersion: '131.0.2903.48',
      device: 'mobile',
      os: 'iOS'
    })
  })

  test('identifies mobile Safari on iOS', () => {
    expect(
      parse(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toMatchObject({ browser: 'Safari', device: 'mobile', os: 'iOS' })
  })

  test('treats an iPad as a tablet', () => {
    expect(
      parse('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1')
    ).toMatchObject({ device: 'tablet', os: 'iOS' })
  })

  test('flags a crawler', () => {
    expect(
      parse(
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      )
    ).toMatchObject({ bot: true, device: 'bot' })
  })

  test('falls back to desktop for an unknown agent', () => {
    expect(parse('curl/8.5.0')).toEqual({ bot: false, device: 'desktop' })
  })
})

describe('geoEnricher', () => {
  const enricher = geoEnricher()

  test('adds nothing without platform headers', () => {
    expect(enricher.request?.(requestWith({}))).toBeUndefined()
  })

  test('reads Vercel headers and decodes the city', () => {
    const fields = enricher.request?.(
      requestWith({
        'x-vercel-ip-city': 'S%C3%A3o%20Paulo',
        'x-vercel-ip-country': 'BR',
        'x-vercel-ip-country-region': 'SP',
        'x-vercel-ip-latitude': '-23.5505',
        'x-vercel-ip-longitude': '-46.6333',
        'x-vercel-ip-timezone': 'America/Sao_Paulo'
      })
    )

    expect(fields?.geo).toEqual({
      city: 'São Paulo',
      country: 'BR',
      latitude: -23.5505,
      longitude: -46.6333,
      region: 'SP',
      timezone: 'America/Sao_Paulo'
    })
  })

  test('reads Cloudflare headers', () => {
    const fields = enricher.request?.(
      requestWith({
        'cf-ipcity': 'Bangkok',
        'cf-ipcountry': 'TH',
        'cf-iplatitude': '13.7563',
        'cf-region-code': '10'
      })
    )

    expect(fields?.geo).toEqual({
      city: 'Bangkok',
      country: 'TH',
      latitude: 13.7563,
      region: '10'
    })
  })

  test('decodes the Netlify geo blob', () => {
    const payload = btoa(
      JSON.stringify({
        city: 'Berlin',
        country: { code: 'DE' },
        latitude: 52.52,
        subdivision: { code: 'BE' },
        timezone: 'Europe/Berlin'
      })
    )

    expect(
      enricher.request?.(requestWith({ 'x-nf-geo': payload }))?.geo
    ).toEqual({
      city: 'Berlin',
      country: 'DE',
      latitude: 52.52,
      region: 'BE',
      timezone: 'Europe/Berlin'
    })
  })

  test('ignores an unparseable Netlify blob', () => {
    expect(
      enricher.request?.(requestWith({ 'x-nf-geo': 'not-base64-json' }))
    ).toBeUndefined()
  })

  test('ignores a Netlify blob containing null', () => {
    expect(
      enricher.request?.(requestWith({ 'x-nf-geo': btoa('null') }))
    ).toBeUndefined()
  })

  test('ignores a Netlify blob containing a non-object primitive', () => {
    expect(
      enricher.request?.(requestWith({ 'x-nf-geo': btoa('"string"') }))
    ).toBeUndefined()
    expect(
      enricher.request?.(requestWith({ 'x-nf-geo': btoa('123') }))
    ).toBeUndefined()
  })

  test('drops a non-numeric coordinate', () => {
    expect(
      enricher.request?.(
        requestWith({
          'x-vercel-ip-country': 'TH',
          'x-vercel-ip-latitude': 'unknown'
        })
      )?.geo
    ).toEqual({ country: 'TH' })
  })
})

describe('sizeEnricher', () => {
  const enricher = sizeEnricher()

  test('reads the request content-length', () => {
    expect(
      enricher.request?.(requestWith({ 'content-length': '1024' }))
    ).toEqual({ requestBytes: 1024 })
  })

  test('adds nothing without a request content-length', () => {
    expect(enricher.request?.(requestWith({}))).toBeUndefined()
  })

  test('reads the response content-length whatever its casing', () => {
    expect(
      enricher.response?.({
        durationMs: 1,
        headers: { 'Content-Length': '2048' },
        request: requestWith({}),
        status: 200
      })
    ).toEqual({ responseBytes: 2048 })
  })

  test('omits the response size when the header is absent', () => {
    expect(
      enricher.response?.({
        durationMs: 1,
        headers: {},
        request: requestWith({}),
        status: 200
      })
    ).toBeUndefined()
  })

  test('rejects a negative or non-numeric length', () => {
    expect(
      enricher.request?.(requestWith({ 'content-length': '-5' }))
    ).toBeUndefined()
    expect(
      enricher.request?.(requestWith({ 'content-length': 'many' }))
    ).toBeUndefined()
  })
})
