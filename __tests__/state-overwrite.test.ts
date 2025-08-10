import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'
import logixlysia from '../src/index'

describe('Elysia with state', () => {
  it('Should return state with logixlysia', () => {
    const app = new Elysia()
      .state('state', { a: 1 } as const)
      .use(logixlysia())
      .get('/test', ({ store }) => store.state)
    expect(
      app.handle(new Request('http://localhost/test')).then(x => x.json())
    ).resolves.toMatchObject({
      a: 1
    })
  })
  it('Should return state without logixlysia', () => {
    const app = new Elysia()
      .state('state', { a: 1 } as const)
      .get('/test', ({ store }) => store.state)
    expect(
      app.handle(new Request('http://localhost/test')).then(x => x.json())
    ).resolves.toMatchObject({
      a: 1
    })
  })
})
