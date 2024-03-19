import { Elysia } from 'elysia'
import { edenTreaty } from '@elysiajs/eden'
import { describe, it, expect, beforeAll, beforeEach } from 'bun:test'
import { logger } from '../src'

describe('Logixlysia', () => {
  let server: Elysia
  let app: any
  let logs: string[] = []

  describe('IP logging disabled', () => {
    beforeAll(() => {
      server = new Elysia()
        .use(logger({ ip: false }))
        .get('/', () => '🦊 Logixlysia Getting')
        .post('logixlysia', () => '🦊 Logixlysia Posting')
        .listen(3000)

      app = edenTreaty<typeof server>('http://127.0.0.1:3000')
    })

    beforeEach(() => {
      logs = []
    })

    it("Responds correctly to GET '/' requests", async () => {
      const requestCount = 5

      for (let i = 0; i < requestCount; i++) {
        logs.push((await app.get('/')).data)
      }

      logs.forEach(log => {
        expect(log).toBe('🦊 Logixlysia Getting')
      })
    })

    it("Responds correctly to POST '/logixlysia' requests", async () => {
      const requestCount = 5

      for (let i = 0; i < requestCount; i++) {
        const postResponse = await app.logixlysia.post({})
        logs.push(
          postResponse.status === 200 ? postResponse.data : postResponse.error
        )
      }

      logs.forEach(log => {
        expect(log).toBe('🦊 Logixlysia Posting')
      })
    })
  })
})
