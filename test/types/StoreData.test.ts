import { describe, expect, it } from 'bun:test'
import { StoreData } from '~/types/StoreData'

describe('Store Data interface', () => {
  it('Defines the StoreData interface correctly', () => {
    const beforeTime: bigint = BigInt(1633393533526) // Example bigint value

    const storeData: StoreData = { beforeTime }

    expect(storeData).toEqual(
      expect.objectContaining({
        beforeTime: expect.any(BigInt)
      })
    )
  })
})
