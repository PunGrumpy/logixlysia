import { describe, expect, it } from 'bun:test'

import { ColorMap } from '~/types'

describe('Color Mapping Interface', () => {
  it('Defines an object with string keys mapping to functions', () => {
    const colorMap: ColorMap = {
      red: (str: string) => `Red: ${str}`,
      green: (str: string) => `Green: ${str}`,
      blue: (str: string) => `Blue: ${str}`
    }

    expect(colorMap).toEqual(
      expect.objectContaining({
        red: expect.any(Function),
        green: expect.any(Function),
        blue: expect.any(Function)
      })
    )

    Object.keys(colorMap).forEach(key => {
      expect(typeof colorMap[key]).toBe('function')
    })
  })
})
