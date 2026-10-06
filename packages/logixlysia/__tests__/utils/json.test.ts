import { describe, expect, test } from 'bun:test'
import { stringifyForLog } from '../../src/utils/json'

describe('stringifyForLog', () => {
  test('writes a BigInt as its decimal string', () => {
    expect(stringifyForLog({ id: 10n })).toBe('{"id":"10"}')
  })

  test('writes BigInts nested in arrays', () => {
    expect(stringifyForLog([1n, [2n]])).toBe('["1",["2"]]')
  })

  test('replaces a reference to an ancestor with "[Circular]"', () => {
    const node: Record<string, unknown> = {}
    node.self = node
    expect(stringifyForLog(node)).toBe('{"self":"[Circular]"}')
  })

  test('writes a value shared by two siblings in full both times', () => {
    const shared = { x: 1 }
    expect(stringifyForLog({ a: shared, b: shared })).toBe(
      '{"a":{"x":1},"b":{"x":1}}'
    )
  })

  test('replaces a value whose toJSON throws with "[Unserializable]"', () => {
    const value = {
      toJSON: () => {
        throw new Error('nope')
      }
    }
    expect(stringifyForLog(value)).toBe('"[Unserializable]"')
  })

  test('returns an empty string when there is nothing to write', () => {
    const nothing: unknown = undefined
    expect(stringifyForLog(nothing)).toBe('')
  })

  test('bounds the depth and stays fast on deep input', () => {
    let deep: unknown = 'leaf'
    for (let i = 0; i < 40_000; i += 1) {
      deep = [deep]
    }
    const start = performance.now()
    const json = stringifyForLog(deep)
    expect(performance.now() - start).toBeLessThan(500)
    expect(json).toContain('[Depth]')
  })
})
