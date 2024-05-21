import { describe, expect, it } from 'bun:test'

import { Server } from '~/types'

describe('Server interface', () => {
  it('Defines the Server interface correctly', () => {
    const server: Server = {
      hostname: 'example.com',
      port: 8080,
      protocol: 'https'
    }

    expect(server).toEqual(
      expect.objectContaining({
        hostname: expect.any(String),
        port: expect.any(Number),
        protocol: expect.any(String)
      })
    )
  })

  it('Allows optional properties in the Server interface', () => {
    const serverWithoutOptionalProps: Server = {}

    expect(serverWithoutOptionalProps).toEqual(expect.objectContaining({}))
  })
})
