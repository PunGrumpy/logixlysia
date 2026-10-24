import { describe, expect, test } from 'bun:test'
import { HttpError } from '../../src/interfaces'
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

  test('writes an Error as its name, message, cause and own fields', () => {
    const error = Object.assign(
      new Error('outer', { cause: new Error('inner') }),
      { code: 'E1' }
    )
    const json = stringifyForLog({ e: error })
    expect(JSON.parse(json)).toEqual({
      e: {
        cause: { message: 'inner', name: 'Error' },
        code: 'E1',
        message: 'outer',
        name: 'Error'
      }
    })
    expect(json).not.toContain('stack')
  })

  test('writes a Map as an object and a Set as an array', () => {
    expect(
      stringifyForLog({ m: new Map([['a', 1]]), s: new Set(['x', 'y']) })
    ).toBe('{"m":{"a":1},"s":["x","y"]}')
  })

  test('keeps a toJSON result as it is', () => {
    expect(stringifyForLog(new HttpError(404, 'gone'))).toBe(
      JSON.stringify(new HttpError(404, 'gone'))
    )
  })

  test('marks a Map that contains itself as circular, and writes a shared Error twice', () => {
    const map = new Map<string, unknown>()
    map.set('self', map)
    expect(stringifyForLog(map)).toBe('{"self":"[Circular]"}')

    const shared = new Error('twice')
    const written = '{"message":"twice","name":"Error"}'
    expect(stringifyForLog({ a: shared, b: shared })).toBe(
      `{"a":${written},"b":${written}}`
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
