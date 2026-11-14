import { describe, expect, test } from 'bun:test'
import { redact, redactRequest, redactString } from '../../src/utils/redact'

const PATTERNS = [/cust_[a-z0-9]+/gu]

const STRINGS: [input: string, redacted: string][] = [
  ['', ''],
  ['GET', 'GET'],
  ['localhost', 'localhost'],
  ['plain text with nothing secret', 'plain text with nothing secret'],
  [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  ],
  ['2026-11-12T05:39:55.808Z', '2026-11-12T05:39:55.808Z'],
  ['version 1.2.3.4.5', 'version 1.2.3.4.5'],
  ['host:3000', 'host:3000'],
  ['user@example.com wrote', '[REDACTED] wrote'],
  ['contact user@example.com today', 'contact [REDACTED] today'],
  ['mail USER@Example.COM', 'mail [REDACTED]'],
  ['10.0.0.1 at start', '[REDACTED] at start'],
  ['ip 10.0.0.1 here', 'ip [REDACTED] here'],
  ['end 192.168.1.1', 'end [REDACTED]'],
  ['v6 2001:db8::1 here', 'v6 [REDACTED] here'],
  ['::1', '[REDACTED]'],
  ['fe80::1ff:fe23:4567:890a', '[REDACTED]'],
  ['FE80::ABCD', '[REDACTED]'],
  ['4111 1111 1111 1111', '[REDACTED]'],
  ['card 4111-1111-1111-1111 ok', 'card [REDACTED] ok'],
  ['4111111111111111', '[REDACTED]'],
  ['card 422--222--222--222--2 ok', 'card [REDACTED] ok'],
  ['422  222  222  222  2', '[REDACTED]'],
  ['4  1  1  1  1  1  1  1  1  1  1  1  1  1  1  1', '[REDACTED]'],
  ['card 4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 end', 'card [REDACTED] end'],
  ['4-1-1-1-1-1-1-1-1-1-1-1-1-1-1-1', '[REDACTED]'],
  ['3 7 8 2 8 2 2 4 6 3 1 0 0 0 5', '[REDACTED]'],
  ['id 12 4111 1111 1111 1111', 'id 12 [REDACTED]'],
  ['4111 1111 1111 1111 99', '[REDACTED] 99'],
  ['id 6 4111 1111 1111 1111', 'id [REDACTED]'],
  ['3737 703956 90743 3731 806857 48310', '[REDACTED]'],
  ['4111 1111 1111 1111x', '4111 1111 1111 1111x'],
  ['4111 1111 1111 1111 x', '[REDACTED] x'],
  ['4111111111111112', '4111111111111112'],
  [
    'c861a892-3269-4521-94f6-9c9cb222bee8',
    'c861a892-3269-4521-94f6-9c9cb222bee8'
  ],
  ['892-3269-4521-94', '[REDACTED]'],
  ['a4111111111111111', 'a4111111111111111'],
  ['4111-1111-1111-1111', '[REDACTED]'],
  [`${'x'.repeat(300)} 4111111111111111`, `${'x'.repeat(300)} [REDACTED]`],
  [`${'x'.repeat(300)}.${'4111111111111111'}`, `${'x'.repeat(300)}.[REDACTED]`],
  ['order 1234567890123 total', 'order 1234567890123 total'],
  ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-_x', '[REDACTED]'],
  [
    'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-_x end',
    'token [REDACTED] end'
  ],
  [
    'xeyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig',
    'xeyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'
  ],
  ['Bearer abc123def456', 'Bearer [REDACTED]'],
  ['auth bearer abcdefghij', 'auth bearer abcdefghij'],
  ['Basic dXNlcjpwYXNz', 'Basic [REDACTED]'],
  ['BEARER Abc12345678', 'BEARER Abc12345678'],
  ['bearer aBcdefghij', 'bearer [REDACTED]'],
  ['redis://:hunter2@cache:6379', 'redis://:[REDACTED]@cache:6379'],
  ['postgres://user:pa55@db/x', 'postgres://user:[REDACTED]@db/x'],
  [
    'see https://user:pw@host/path ok',
    'see https://user:[REDACTED]@host/path ok'
  ],
  ['x ://a:b@c', 'x ://a:b@c'],
  ['héllo wörld 日本語', 'héllo wörld 日本語'],
  ['メール user@example.com です', 'メール [REDACTED] です'],
  ['emoji 🦊 10.0.0.1 🦊', 'emoji 🦊 [REDACTED] 🦊'],
  [
    'a@b.co 10.0.0.1 eyJa.eyJb.c Bearer abc.def-123',
    '[REDACTED] [REDACTED] [REDACTED] Bearer [REDACTED]'
  ]
]

const WITH_PATTERNS: [input: string, redacted: string][] = [
  ['cust_abc at start', '[REDACTED] at start'],
  ['id=cust_x9 user@example.com', 'id=[REDACTED] [REDACTED]'],
  ['ends with cust_zz', 'ends with [REDACTED]'],
  ['no customer here', 'no customer here']
]

describe('redaction table', () => {
  test.each(STRINGS)('redactString(%p)', (input, redacted) => {
    expect(redactString(input)).toBe(redacted)
    expect(redact(input)).toBe(redacted)
  })

  test.each(WITH_PATTERNS)('redactString(%p) with a pattern', (input, out) => {
    expect(redactString(input, PATTERNS)).toBe(out)
  })

  test('masks record values by key name and by pattern', () => {
    expect(
      redact({
        Cookie: 'y',
        apiKey: 'z',
        authorization: 'Bearer x',
        list: ['10.0.0.1', 'plain'],
        nested: { 'X-Api-Key': 'k', note: 'mail a@b.co' },
        sessionId: 'abc',
        status: 200
      })
    ).toEqual({
      Cookie: '[REDACTED]',
      apiKey: '[REDACTED]',
      authorization: '[REDACTED]',
      list: ['[REDACTED]', 'plain'],
      nested: { 'X-Api-Key': '[REDACTED]', note: 'mail [REDACTED]' },
      sessionId: '[REDACTED]',
      status: 200
    })
  })
})

const REQUEST_HEADERS = {
  accept: 'application/json',
  authorization: 'Bearer abc.def.ghi',
  cookie: 'session=s3cr3t; theme=dark',
  referer: 'https://u:p@example.com/from?email=a@b.co',
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0',
  'x-forwarded-for': '203.0.113.7, 10.0.0.2',
  'x-real-ip': '198.51.100.4',
  'x-trace': 'for cust_abc'
}

const REQUESTS: {
  headers: Record<string, string>
  method: string
  redacted: { headers: [string, string][]; method: string; url: string }
  url: string
}[] = [
  {
    headers: REQUEST_HEADERS,
    method: 'GET',
    redacted: {
      headers: [
        ['accept', 'application/json'],
        ['authorization', '[REDACTED]'],
        ['cookie', '[REDACTED]'],
        ['referer', 'https://u:redacted@example.com/from?email=%5BREDACTED%5D'],
        ['user-agent', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0.0.0'],
        ['x-forwarded-for', '[REDACTED], [REDACTED]'],
        ['x-real-ip', '[REDACTED]'],
        ['x-trace', 'for [REDACTED]']
      ],
      method: 'GET',
      url: 'http://localhost:3000/api/users/42?page=2'
    },
    url: 'http://localhost:3000/api/users/42?page=2'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://localhost/plain' },
    url: 'http://localhost/plain'
  },
  {
    headers: { 'content-type': 'text/plain' },
    method: 'POST',
    redacted: {
      headers: [['content-type', 'text/plain']],
      method: 'POST',
      url: 'http://redacted:3000/a/[REDACTED]/b?token=redacted&q=%5BREDACTED%5D#frag-eyJa.eyJb.c'
    },
    url: 'http://192.168.1.1:3000/a/user@example.com/b?token=t&q=10.0.0.1#frag-eyJa.eyJb.c'
  },
  {
    headers: { location: 'http://h/next' },
    method: 'GET',
    redacted: {
      headers: [['location', 'http://h/next']],
      method: 'GET',
      url: 'http://u:redacted@h/p?apiKey=redacted&apiKey=redacted&to=ok&to=%5BREDACTED%5D'
    },
    url: 'http://u:pw@h/p?apiKey=one&apiKey=two&to=ok&to=bob@example.com'
  },
  {
    headers: {},
    method: 'GET',
    redacted: {
      headers: [],
      method: 'GET',
      url: 'http://h/%E3%83%A1%E3%83%BC%E3%83%AB/%5BREDACTED%5D/[REDACTED]'
    },
    url: 'http://h/%E3%83%A1%E3%83%BC%E3%83%AB/a%40b.co/cust_q1'
  },
  {
    headers: { location: 'foo:/a', referer: 'http://h/p#' },
    method: 'GET',
    redacted: {
      headers: [
        ['location', 'foo:///a'],
        ['referer', 'http://h/p']
      ],
      method: 'GET',
      url: 'http://h/p'
    },
    url: 'http://h/p#'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://h/p?page=2&sort=asc' },
    url: 'http://h/p?page=2&sort=asc'
  },
  {
    headers: {},
    method: 'GET',
    redacted: {
      headers: [],
      method: 'GET',
      url: 'http://h/p?token=redacted&page=2'
    },
    url: 'http://h/p?token=abc&page=2'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://h/p?token=redacted' },
    url: 'http://h/p?token'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://h/p?a=1&&b=2' },
    url: 'http://h/p?a=1&&b=2'
  },
  {
    headers: {},
    method: 'GET',
    redacted: {
      headers: [],
      method: 'GET',
      url: 'http://h/p?ip=%5BREDACTED%5D&q=1'
    },
    url: 'http://h/p?ip=10.0.0.1&q=1'
  },
  {
    headers: {},
    method: 'GET',
    redacted: {
      headers: [],
      method: 'GET',
      url: 'http://h/p?card=%5BREDACTED%5D'
    },
    url: 'http://h/p?card=4111-1111-1111-1111'
  },
  {
    headers: {},
    method: 'GET',
    redacted: {
      headers: [],
      method: 'GET',
      url: 'http://h/p?note=%5BREDACTED%5D&q=1'
    },
    url: 'http://h/p?note=cust_abc&q=1'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://h/p?q=a=b=c' },
    url: 'http://h/p?q=a=b=c'
  },
  {
    headers: {},
    method: 'GET',
    redacted: { headers: [], method: 'GET', url: 'http://h/p?v=1.2.3&q=x-y_z' },
    url: 'http://h/p?v=1.2.3&q=x-y_z'
  }
]

describe('request redaction table', () => {
  test.each(REQUESTS)('$method $url', ({ headers, method, redacted, url }) => {
    const out = redactRequest(new Request(url, { headers, method }), {
      patterns: PATTERNS
    })
    expect({
      headers: [...out.headers],
      method: out.method,
      url: out.url
    }).toEqual(redacted)
  })

  test('re-serializes a URL value as before', () => {
    expect(String(redact(new URL('foo:/a')))).toBe('foo:///a')
    expect(String(redact(new URL('http://h/p#')))).toBe('http://h/p')
  })
})
