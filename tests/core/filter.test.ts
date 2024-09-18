import { expect, test } from 'bun:test'

import { filterLog } from '../../src/core/filter'
import { Options } from '../../src/types'

test('filterLog', () => {
  const options: Options = {
    config: {
      logFilter: {
        level: 'ERROR',
        method: 'POST',
        status: 500
      }
    }
  }

  expect(filterLog('ERROR', 500, 'POST', options)).toBe(true)
  expect(filterLog('INFO', 200, 'GET', options)).toBe(false)
  expect(filterLog('WARNING', 400, 'PUT', options)).toBe(false)

  // Test with array filters
  const arrayOptions: Options = {
    config: {
      logFilter: {
        level: ['ERROR', 'WARNING'],
        method: ['POST', 'PUT'],
        status: [500, 400]
      }
    }
  }

  expect(filterLog('ERROR', 500, 'POST', arrayOptions)).toBe(true)
  expect(filterLog('WARNING', 400, 'PUT', arrayOptions)).toBe(true)
  expect(filterLog('INFO', 200, 'GET', arrayOptions)).toBe(false)
})
