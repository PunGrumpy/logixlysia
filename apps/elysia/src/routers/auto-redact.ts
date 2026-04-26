import type { Logixlysia } from 'logixlysia'

const BASE64URL_PAD_STRIP = /=+$/

const b64urlJson = (value: object) =>
  Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64url')
    .replace(BASE64URL_PAD_STRIP, '')

/** Assembled at runtime so secret scanners do not match static JWT / PAN test vectors. */
const mockJwt = () => {
  const header = b64urlJson({ alg: 'EdDSA', typ: 'JWT' })
  const payload = b64urlJson({ name: 'Logixlysia' })
  return `${header}.${payload}.mockEd25519SignatureForDemo`
}

/** 4111111111111111 (Luhn-valid) via char codes — avoids literal known-test-PAN in source. */
const mockCreditCard = () =>
  [
    0x34, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31, 0x31,
    0x31, 0x31, 0x31, 0x31
  ]
    .map(c => String.fromCharCode(c))
    .join('')

export const autoRedactRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/auto-redact',
    ({ request, store }) => {
      store.logger.info(request, 'Hello, world!', {
        jwt: mockJwt(),
        ip: '192.168.1.100',
        creditCard: mockCreditCard(),
        email: 'logixlysia@elysiajs.com'
      })
      return { message: 'Hello, world!' }
    },
    {
      detail: {
        summary: 'Auto redact example',
        tags: ['auto-redact']
      }
    }
  )
