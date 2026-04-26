import type { Logixlysia } from 'logixlysia'

export const autoRedactRouter = <App extends Logixlysia>(app: App) =>
  app.get(
    '/auto-redact',
    ({ request, store }) => {
      store.logger.info(request, 'Hello, world!', {
        jwt: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiTG9naXhseXNpYSJ9.mRQOq-xZeWcmtjA14isEf5PqflUeQkyVGnd4-ejuj-SVatv_SJgxuxyau-Se-86rnKhqeL9kJ2j23kq2qeV0BA',
        ip: '192.168.1.100',
        creditCard: '4111111111111111',
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
