import type { Logixlysia } from 'logixlysia'

const BASE64URL_PAD_STRIP = /[=]+$/u

const b64urlJson = (value: object) =>
  Buffer.from(JSON.stringify(value), 'utf-8')
    .toString('base64url')
    .replace(BASE64URL_PAD_STRIP, '')

/** Assembled at runtime so secret scanners do not match static JWT / PAN test vectors. */
const mockJwt = () => {
  const header = b64urlJson({ alg: 'EdDSA', typ: 'JWT' })
  const payload = b64urlJson({ name: 'Logixlysia' })
  return `${header}.${payload}.mockEd25519SignatureForDemo`
}

const mockCreditCard = (): string => `4${'1'.repeat(15)}`

export const autoRedactRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/auto-redact',
    {
      detail: {
        summary: 'Auto redact example',
        tags: ['auto-redact']
      }
    },
    ({ request, store }) => {
      store.logger.info(request, 'Hello, world!', {
        creditCard: mockCreditCard(),
        email: 'logixlysia@elysiajs.com',
        ip: '192.168.1.100',
        jwt: mockJwt()
      })
      return { message: 'Hello, world!' }
    }
  )
